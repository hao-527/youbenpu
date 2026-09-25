package billimport

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"regexp"
	"strconv"
)

// xlsxSheet is a minimal representation of a parsed worksheet: rows of string
// cells with shared strings already resolved. We only need read access to the
// first sheet, so a full spreadsheet library would be overkill.
type xlsxSheet struct {
	rows [][]string
}

// parseXLSX reads the first worksheet of an xlsx file into rows of strings.
// xlsx is a zip archive of XML parts; we resolve the shared string table and
// map each cell to its text, leaving numeric cells as their raw value so the
// caller can interpret Excel date serials itself.
func parseXLSX(data []byte) (*xlsxSheet, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("open xlsx: %w", err)
	}

	var sharedXML, sheetXML []byte
	for _, file := range reader.File {
		switch file.Name {
		case "xl/sharedStrings.xml":
			sharedXML, err = readZipEntry(file)
		case "xl/worksheets/sheet1.xml":
			sheetXML, err = readZipEntry(file)
		}
		if err != nil {
			return nil, err
		}
	}
	if sheetXML == nil {
		return nil, fmt.Errorf("xlsx missing sheet1")
	}

	shared := parseSharedStrings(sharedXML)
	return parseSheet(sheetXML, shared)
}

func readZipEntry(file *zip.File) ([]byte, error) {
	rc, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", file.Name, err)
	}
	defer rc.Close()
	// Bills are small; cap defensively at 16 MiB to avoid a zip-bomb blowup.
	return io.ReadAll(io.LimitReader(rc, 16<<20))
}

// parseSharedStrings resolves the <si> entries of the shared string table.
// Each <si> may hold a single <t> or several <r><t> runs (rich text); we
// concatenate the runs so styled cells still yield their full text.
func parseSharedStrings(data []byte) []string {
	if data == nil {
		return nil
	}
	var doc struct {
		SI []struct {
			T string `xml:"t"`
			R []struct {
				T string `xml:"t"`
			} `xml:"r"`
		} `xml:"si"`
	}
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil
	}
	out := make([]string, len(doc.SI))
	for i, si := range doc.SI {
		if len(si.R) > 0 {
			var b bytes.Buffer
			for _, run := range si.R {
				b.WriteString(run.T)
			}
			out[i] = b.String()
		} else {
			out[i] = si.T
		}
	}
	return out
}

// colIndexPattern extracts the column letters from a cell reference like "C15".
var colIndexPattern = regexp.MustCompile(`^([A-Z]+)`)

// columnIndex converts spreadsheet column letters to a zero-based index so a
// row with gaps (missing <c> for empty cells) still lands each value in the
// right column. "A" -> 0, "B" -> 1, "AA" -> 26.
func columnIndex(ref string) int {
	letters := colIndexPattern.FindString(ref)
	idx := 0
	for _, ch := range letters {
		idx = idx*26 + int(ch-'A'+1)
	}
	return idx - 1
}

// parseSheet turns sheet XML into rows of strings. String cells (t="s") are
// resolved against the shared table; inline strings (t="inlineStr") read their
// nested <is><t>; everything else keeps its raw <v> so numeric date serials
// survive for the caller to convert.
func parseSheet(data []byte, shared []string) (*xlsxSheet, error) {
	var doc struct {
		Rows []struct {
			Cells []struct {
				Ref    string `xml:"r,attr"`
				Type   string `xml:"t,attr"`
				Value  string `xml:"v"`
				Inline struct {
					T string `xml:"t"`
				} `xml:"is"`
			} `xml:"c"`
		} `xml:"sheetData>row"`
	}
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("parse sheet: %w", err)
	}

	sheet := &xlsxSheet{rows: make([][]string, 0, len(doc.Rows))}
	for _, row := range doc.Rows {
		cells := make([]string, 0, len(row.Cells))
		for _, cell := range row.Cells {
			idx := columnIndex(cell.Ref)
			for len(cells) <= idx {
				cells = append(cells, "")
			}
			cells[idx] = resolveCell(cell.Type, cell.Value, cell.Inline.T, shared)
		}
		sheet.rows = append(sheet.rows, cells)
	}
	return sheet, nil
}

func resolveCell(cellType, value, inline string, shared []string) string {
	switch cellType {
	case "s": // shared string index
		if idx, err := strconv.Atoi(value); err == nil && idx >= 0 && idx < len(shared) {
			return shared[idx]
		}
		return ""
	case "inlineStr":
		return inline
	default:
		return value
	}
}
