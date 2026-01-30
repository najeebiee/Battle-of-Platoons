import * as XLSX from "xlsx";

export function exportToXlsx({ rows = [], filename = "export.xlsx", sheetName = "Export" } = {}) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}
