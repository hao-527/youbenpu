package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/zhanghao527/youbenpu/services/api/internal/config"
	"github.com/zhanghao527/youbenpu/services/api/internal/database"
	"github.com/zhanghao527/youbenpu/services/api/internal/storage"
	"image"
	"image/png"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

// Opt-in real MySQL verification, exclusively a newly created disposable schema.
func TestDeliveryDatabaseFlows(t *testing.T) {
	if os.Getenv("YBP_INTEGRATION") != "1" {
		t.Skip("requires isolated local MySQL")
	}
	cfg, err := config.Load()
	if err != nil {
		t.Fatal("invalid local configuration")
	}
	if cfg.Environment == "production" || (cfg.DBHost != "127.0.0.1" && cfg.DBHost != "localhost") {
		t.Fatal("requires local non-production database")
	}
	dbc := database.Config{Host: cfg.DBHost, Port: cfg.DBPort, User: cfg.DBUser, Password: cfg.DBPassword}
	admin, err := database.Connect(dbc)
	if err != nil {
		t.Fatal("local database unavailable")
	}
	defer admin.Close()
	name := fmt.Sprintf("youbenpu_delivery_%d", time.Now().UnixNano())
	if _, err := admin.Exec("CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"); err != nil {
		t.Fatal("cannot create isolated schema")
	}
	defer func() {
		if _, err := admin.Exec("DROP DATABASE `" + name + "`"); err != nil {
			t.Error("test schema cleanup failed")
		}
	}()
	dbc.DBName = name
	db, err := database.Connect(dbc)
	if err != nil {
		t.Fatal("isolated connection failed")
	}
	defer db.Close()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	if err := database.Migrate(db, logger); err != nil {
		t.Fatal(err)
	}
	store, err := storage.NewLocalStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	cfg.Environment = "test"
	cfg.EnableDevLogin = true
	cfg.WXAppID = ""
	cfg.WXAppSecret = ""
	cfg.JWTSecret = "isolated-test-secret-unused-outside-this-process"
	server := httptest.NewServer(NewRouter(Dependencies{Config: cfg, Logger: logger, DB: db, ObjectStore: store}))
	defer server.Close()
	call := func(token, method, path string, body any) (int, map[string]any) {
		var reader io.Reader
		if body != nil {
			raw, _ := json.Marshal(body)
			reader = bytes.NewReader(raw)
		}
		req, _ := http.NewRequest(method, server.URL+"/api/v1/"+path, reader)
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var v any
		json.NewDecoder(resp.Body).Decode(&v)
		if rows, ok := v.([]any); ok {
			return resp.StatusCode, map[string]any{"rows": rows}
		}
		return resp.StatusCode, v.(map[string]any)
	}
	expect := func(test *testing.T, token, method, path string, body any, want int) map[string]any {
		test.Helper()
		status, result := call(token, method, path, body)
		if status != want {
			test.Errorf("%s %s status=%d want=%d error=%v", method, path, status, want, result["error"])
		}
		return result
	}
	login := func(identity string) (string, string) {
		v := expect(t, "", "POST", "auth/login", map[string]any{"code": "local-development", "dev_identity": identity}, 200)
		return v["token"].(string), v["user_id"].(string)
	}
	a, aid := login("delivery-admin-account-20261009")
	b, bid := login("delivery-member-account-20261009")
	c, _ := login("delivery-outsider-account-20261009")
	family := expect(t, a, "POST", "family", map[string]any{"name": "隔离交付家庭", "display_name": "管理员"}, 201)["id"].(string)
	code := expect(t, a, "POST", "family/invite", nil, 201)["code"].(string)
	expect(t, b, "POST", "family/join", map[string]any{"code": code, "display_name": "普通成员"}, 200)
	expect(t, c, "POST", "family", map[string]any{"name": "另一个隔离家庭"}, 201)
	t.Run("permissions", func(t *testing.T) {
		expect(t, b, "PUT", "family/rename", map[string]any{"name": "越权"}, 403)
		expect(t, b, "POST", "family/invite", nil, 403)
		expect(t, c, "PUT", "families/active", map[string]any{"family_id": family}, 403)
		expect(t, a, "PUT", "family/member/role", map[string]any{"member_id": aid, "role": "member"}, 409)
		expect(t, "bad-token", "GET", "ledger", nil, 401)
	})
	entry := map[string]any{"type": "expense", "amount_cents": 123, "purpose": "采购", "member_name": "管理员", "date": "2026-10-09", "time_label": "今天", "note": "私密测试", "note_visibility": "private"}
	id := expect(t, a, "POST", "ledger", entry, 201)["id"].(string)
	t.Run("invitation-and-role-protection", func(t *testing.T) {
		expect(t, c, "POST", "family/join", map[string]any{"code": code}, 410)
		expired := expect(t, a, "POST", "family/invite", nil, 201)["code"].(string)
		if _, err := db.Exec("UPDATE invitations SET expires_at=DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE code=?", expired); err != nil {
			t.Fatal(err)
		}
		expect(t, c, "POST", "family/join", map[string]any{"code": expired}, 410)
		expect(t, a, "POST", "family/leave", nil, 409)
		expect(t, a, "PUT", "family/member/role", map[string]any{"member_id": bid, "role": "owner"}, 200)
		expect(t, b, "POST", "family/invite", nil, 201)
		expect(t, a, "PUT", "family/member/role", map[string]any{"member_id": bid, "role": "member"}, 200)
		expect(t, b, "POST", "family/invite", nil, 403)
	})
	t.Run("private-and-unchanged", func(t *testing.T) {
		rows := expect(t, b, "GET", "ledger", nil, 200)["rows"].([]any)
		if _, ok := rows[0].(map[string]any)["note"]; ok {
			t.Error("private note leaked")
		}
		expect(t, b, "PUT", "ledger/"+id, entry, 403)
		expect(t, b, "DELETE", "ledger/"+id, nil, 403)
		expect(t, c, "PUT", "ledger/"+id, entry, 404)
		expect(t, a, "PUT", "ledger/"+id, entry, 200)
	})
	t.Run("ledger-no-truncation", func(t *testing.T) {
		for i := 0; i < 205; i++ {
			if _, err := db.Exec("INSERT INTO ledger_entries(id,family_id,recorder_id,type,amount_cents,purpose,member_name,occurred_at,time_label,note_visibility) VALUES(?,?,?,'expense',1,'数量回归','管理员','2026-10-09','今天','shared')", database.NewID(), family, aid); err != nil {
				t.Fatal(err)
			}
		}
		rows := expect(t, a, "GET", "ledger", nil, 200)["rows"].([]any)
		if len(rows) != 206 {
			t.Errorf("ledger truncated: got %d want 206", len(rows))
		}
	})
	loc := expect(t, a, "POST", "locations", map[string]any{"name": "隔离冰箱"}, 201)["id"].(string)
	inv := map[string]any{"name": "牛奶", "category": "食品", "location": "隔离冰箱", "quantity_label": "1盒", "status": "normal", "expiry_date": "2026-10-11"}
	iid := expect(t, a, "POST", "inventory", inv, 201)["id"].(string)
	t.Run("inventory-lifecycle", func(t *testing.T) {
		for _, route := range []string{"inventory", "inventory?status=normal"} {
			rows := expect(t, a, "GET", route, nil, 200)["rows"].([]any)
			if len(rows) != 1 || rows[0].(map[string]any)["expiry_date"] != "2026-10-11" {
				t.Fatalf("expiry date must preserve YYYY-MM-DD: %v", rows)
			}
		}
		expect(t, a, "PUT", "inventory/"+iid, inv, 200)
		expect(t, a, "DELETE", "locations/"+loc, nil, 409)
		expect(t, c, "PUT", "inventory/"+iid+"/status", map[string]any{"status": "finished"}, 404)
		expect(t, a, "DELETE", "inventory/"+iid, nil, 409)
		expect(t, a, "PUT", "inventory/"+iid+"/status", map[string]any{"status": "deleted"}, 200)
		expect(t, a, "PUT", "inventory/"+iid+"/status", map[string]any{"status": "normal"}, 200)
		expect(t, a, "DELETE", "inventory/batch", map[string]any{"ids": []string{iid}}, 409)
		expect(t, a, "PUT", "inventory/"+iid+"/status", map[string]any{"status": "finished"}, 200)
		expect(t, a, "DELETE", "inventory/batch", map[string]any{"ids": []string{iid}}, 200)
	})
	dish := map[string]any{"name": "炒饭", "category": "主食", "method": "炒", "ingredients": []string{"米饭"}}
	did := expect(t, a, "POST", "dishes", dish, 201)["id"].(string)
	t.Run("order-closure", func(t *testing.T) {
		expect(t, a, "PUT", "dishes/"+did, dish, 200)
		order := map[string]any{"items": []any{map[string]any{"dish_id": did, "dish_name": "伪造", "quantity": 99}}}
		oid := expect(t, b, "POST", "orders", order, 201)["id"].(string)
		expect(t, a, "POST", "orders", order, 409)
		expect(t, a, "DELETE", "dishes/"+did, nil, 409)
		rows := expect(t, a, "GET", "orders", nil, 200)["rows"].([]any)
		if rows[0].(map[string]any)["items"].([]any)[0].(map[string]any)["dish_name"] != "炒饭" {
			t.Error("forged name persisted")
		}
		expect(t, c, "PUT", "orders/"+oid+"/status", map[string]any{"status": "completed"}, 404)
		expect(t, a, "PUT", "orders/"+oid+"/status", map[string]any{"status": "completed"}, 200)
		expect(t, b, "PUT", "orders/"+oid+"/status", map[string]any{"status": "cancelled"}, 404)
		expect(t, a, "DELETE", "orders/"+oid, nil, 200)
		expect(t, a, "DELETE", "dishes/"+did, nil, 200)
	})
	t.Run("import-concurrency", func(t *testing.T) {
		e := map[string]any{"fingerprint": strings.Repeat("a", 64), "type": "expense", "amount_cents": 99, "purpose": "导入", "date": "2026-10-09", "counts_toward_total": false}
		payload := map[string]any{"entries": []any{e, e}}
		v := expect(t, a, "POST", "ledger/import/confirm", payload, 200)
		if v["imported"] != float64(1) || v["skipped"] != float64(1) {
			t.Error("payload dedupe failed")
		}
		v = expect(t, a, "POST", "ledger/import/confirm", payload, 200)
		if v["imported"] != float64(0) {
			t.Error("persistent dedupe failed")
		}
		e["fingerprint"] = strings.Repeat("b", 64)
		var wg sync.WaitGroup
		statuses := make(chan int, 8)
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				status, _ := call(a, "POST", "ledger/import/confirm", payload)
				statuses <- status
			}()
		}
		wg.Wait()
		close(statuses)
		for status := range statuses {
			if status != 200 {
				t.Errorf("concurrent duplicate status=%d", status)
			}
		}
		var n int
		db.QueryRow("SELECT COUNT(*) FROM ledger_entries WHERE family_id=? AND import_fingerprint=?", family, strings.Repeat("b", 64)).Scan(&n)
		if n != 1 {
			t.Errorf("persisted %d duplicates", n)
		}
	})

	t.Run("atomic-trash-and-pending-concurrency", func(t *testing.T) {
		i1 := expect(t, a, "POST", "inventory", inv, 201)["id"].(string)
		i2 := expect(t, a, "POST", "inventory", inv, 201)["id"].(string)
		expect(t, a, "PUT", "inventory/"+i1+"/status", map[string]any{"status": "deleted"}, 200)
		expect(t, a, "DELETE", "inventory/batch", map[string]any{"ids": []string{i1, i2}}, 409)
		var count int
		if err := db.QueryRow("SELECT COUNT(*) FROM inventory_items WHERE id IN (?,?)", i1, i2).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 2 {
			t.Error("trash batch partially deleted")
		}
		d := expect(t, a, "POST", "dishes", dish, 201)["id"].(string)
		order := map[string]any{"items": []any{map[string]any{"dish_id": d, "quantity": 100}}}
		expect(t, a, "POST", "orders", order, 400)
		order["items"] = []any{map[string]any{"dish_id": d, "quantity": 1}}
		var wg sync.WaitGroup
		statuses := make(chan int, 8)
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func() { defer wg.Done(); status, _ := call(a, "POST", "orders", order); statuses <- status }()
		}
		wg.Wait()
		close(statuses)
		created := 0
		for status := range statuses {
			if status == 201 {
				created++
			} else if status != 409 {
				t.Errorf("pending concurrency=%d", status)
			}
		}
		if created != 1 {
			t.Errorf("created %d pending orders", created)
		}
		rows := expect(t, a, "GET", "orders", nil, 200)["rows"].([]any)
		oid := rows[0].(map[string]any)["id"].(string)
		expect(t, a, "PUT", "orders/"+oid+"/status", map[string]any{"status": "cancelled"}, 200)
		expect(t, a, "DELETE", "orders/"+oid, nil, 200)
		expect(t, a, "DELETE", "dishes/"+d, nil, 200)
	})
	t.Run("real-files-and-boundaries", func(t *testing.T) {
		upload := func(endpoint, name string, data []byte) (int, map[string]any) {
			var buf bytes.Buffer
			w := multipart.NewWriter(&buf)
			f, _ := w.CreateFormFile("file", name)
			f.Write(data)
			w.Close()
			req, _ := http.NewRequest("POST", server.URL+"/api/v1/"+endpoint, &buf)
			req.Header.Set("Content-Type", w.FormDataContentType())
			req.Header.Set("Authorization", "Bearer "+a)
			response, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			var v map[string]any
			json.NewDecoder(response.Body).Decode(&v)
			return response.StatusCode, v
		}
		for _, file := range []string{"alipay.csv", "wechat.xlsx"} {
			data, err := os.ReadFile("../ledger/billimport/testdata/" + file)
			if err != nil {
				t.Fatal(err)
			}
			status, v := upload("ledger/import", file, data)
			if status != 200 || len(v["drafts"].([]any)) == 0 {
				t.Errorf("real %s parse status=%d", file, status)
			}
		}
		status, v := upload("ledger/import", "too-large.csv", bytes.Repeat([]byte("x"), maxBillUploadSize+1))
		if status != 400 || v["error"].(map[string]any)["code"] != "INVALID_UPLOAD" {
			t.Error("oversize file not rejected at upload boundary")
		}
		status, _ = upload("upload", "fake.png", []byte("not an image"))
		if status != 400 {
			t.Error("fake image accepted")
		}
		var picture bytes.Buffer
		png.Encode(&picture, image.NewRGBA(image.Rect(0, 0, 2, 2)))
		status, v = upload("upload", "valid.png", picture.Bytes())
		if status != 201 && status != 200 {
			t.Errorf("actual PNG upload status=%d", status)
		}
		if url, ok := v["url"].(string); ok {
			response, err := http.Get(url)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			if response.StatusCode != 200 {
				t.Error("uploaded image not retrievable")
			}
		}
		invalid := map[string]any{"entries": []any{map[string]any{"fingerprint": strings.Repeat("x", 65), "type": "income", "amount_cents": 1, "purpose": "invalid", "date": "2026-10-09"}}}
		r := expect(t, a, "POST", "ledger/import/confirm", invalid, 200)
		if r["skipped"] != float64(1) {
			t.Error("invalid fingerprint not safely skipped")
		}
	})
	t.Run("join-merge-excludes-private-notes", func(t *testing.T) {
		d, _ := login("delivery-merge-source-account")
		e, _ := login("delivery-merge-target-account")
		source := expect(t, d, "POST", "family", map[string]any{"name": "来源家庭"}, 201)["id"].(string)
		expect(t, e, "POST", "family", map[string]any{"name": "目标家庭"}, 201)
		draft := map[string]any{"type": "income", "amount_cents": 101, "purpose": "公开迁移", "member_name": "我", "date": "2026-10-09", "note": "公开备注", "note_visibility": "shared"}
		expect(t, d, "POST", "ledger", draft, 201)
		draft["note_visibility"] = "private"
		draft["purpose"] = "私有迁移"
		expect(t, d, "POST", "ledger", draft, 201)
		targetCode := expect(t, e, "POST", "family/invite", nil, 201)["code"].(string)
		expect(t, d, "POST", "family/join", map[string]any{"code": targetCode, "merge_from_family_id": source, "display_name": "迁移成员"}, 200)
		rows := expect(t, e, "GET", "ledger", nil, 200)["rows"].([]any)
		if len(rows) != 1 || rows[0].(map[string]any)["purpose"] != "公开迁移" {
			t.Error("merge leaked private record or omitted shared record")
		}
	})
	t.Run("switch-and-revoke", func(t *testing.T) {
		second := expect(t, a, "POST", "family", map[string]any{"name": "第二隔离家庭"}, 201)["id"].(string)
		if len(expect(t, a, "GET", "ledger", nil, 200)["rows"].([]any)) != 0 {
			t.Error("family data leaked")
		}
		expect(t, a, "PUT", "families/active", map[string]any{"family_id": family}, 200)
		expect(t, a, "DELETE", "family/member", map[string]any{"member_id": bid}, 200)
		expect(t, b, "GET", "ledger", nil, 403)
		expect(t, a, "PUT", "families/active", map[string]any{"family_id": second}, 200)
	})
	t.Run("database-outage-preserves-session", func(t *testing.T) {
		if err := db.Close(); err != nil {
			t.Fatal(err)
		}
		result := expect(t, a, "GET", "ledger", nil, http.StatusServiceUnavailable)
		if result["error"].(map[string]any)["code"] != "DB_UNAVAILABLE" {
			t.Fatal("database outage must not be reported as an invalid user")
		}
	})

}
