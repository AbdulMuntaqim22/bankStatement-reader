export type TextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
};

export type Transaction = {
  date: string;
  title: string;
  debit: number;
  credit: number;
  balance: number | null;
};

export type TxType = "credit" | "debit";

export type TxFilter = TxType | "all";

export type TxGroup = {
  title: string;
  type: TxType;
  count: number;
  total: number;
  firstDate: string;
  lastDate: string;
};

export type PdfExtractOk = {
  ok: true;
  items: TextItem[];
  pageCount: number;
};

export type PdfExtractErr = {
  ok: false;
  reason: "needs_pin" | "wrong_pin" | "empty" | "failed";
  message: string;
};

export type PdfExtractResult = PdfExtractOk | PdfExtractErr;
