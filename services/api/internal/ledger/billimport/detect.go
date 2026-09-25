package billimport

import (
	"bytes"
	"fmt"
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

// Parse detects the bill format from the raw uploaded bytes and dispatches to
// the matching parser. WeChat exports xlsx (a zip, so it starts with "PK");
// Alipay exports a GBK-encoded csv. Returning a typed error lets the handler
// give the user an actionable message instead of a generic 500.
func Parse(data []byte) (*Result, error) {
	if len(data) < 4 {
		return nil, fmt.Errorf("文件为空或格式不正确")
	}
	if bytes.HasPrefix(data, []byte("PK\x03\x04")) {
		return parseWeChat(data)
	}
	return parseAlipay(data)
}

// decodeGBK converts GBK/GB18030 bytes (Alipay's csv encoding) to a UTF-8
// string. If the bytes already decode as valid UTF-8 we return them unchanged,
// so a future UTF-8 export still works.
func decodeGBK(data []byte) (string, error) {
	if isValidUTF8(data) {
		return string(data), nil
	}
	decoded, _, err := transform.Bytes(simplifiedchinese.GB18030.NewDecoder(), data)
	if err != nil {
		return "", fmt.Errorf("账单编码无法识别: %w", err)
	}
	return string(decoded), nil
}

func isValidUTF8(data []byte) bool {
	// Alipay historically exports GBK, but if a UTF-8 export appears the bytes
	// validate cleanly and we skip the GBK decode. utf8.Valid is sufficient
	// because GBK multi-byte sequences rarely form valid UTF-8 by accident.
	return utf8.Valid(data)
}
