import {
  getDocument,
  GlobalWorkerOptions,
  PasswordResponses,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PdfExtractResult, TextItem } from "../parse/types";

type PdfjsTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

GlobalWorkerOptions.workerSrc = workerUrl;

type PasswordError = {
  name?: string;
  code?: number;
  message?: string;
};

function passwordReason(error: unknown): "needs_pin" | "wrong_pin" | null {
  const err = error as PasswordError;
  if (err?.name !== "PasswordException") {
    return null;
  }
  if (err.code === PasswordResponses.INCORRECT_PASSWORD) {
    return "wrong_pin";
  }
  return "needs_pin";
}

function isPdfjsTextItem(item: unknown): item is PdfjsTextItem {
  return (
    !!item &&
    typeof item === "object" &&
    "str" in item &&
    "transform" in item
  );
}

function asTextItem(item: PdfjsTextItem, page: number): TextItem | null {
  const str = item.str ?? "";
  if (!str) {
    return null;
  }
  return {
    str,
    x: item.transform[4],
    y: item.transform[5],
    width: item.width,
    height: item.height,
    page,
  };
}

async function collectItems(pdf: PDFDocumentProxy): Promise<TextItem[]> {
  const items: TextItem[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const raw of content.items) {
      if (!isPdfjsTextItem(raw)) {
        continue;
      }
      const item = asTextItem(raw, pageNumber);
      if (item) {
        items.push(item);
      }
    }
  }
  return items;
}

export async function extractPdf(
  data: ArrayBuffer,
  pin = "",
): Promise<PdfExtractResult> {
  const bytes = new Uint8Array(data.slice(0));
  try {
    const loadingTask = getDocument({
      data: bytes,
      password: pin || "",
      isEvalSupported: false,
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    try {
      const items = await collectItems(pdf);
      if (!items.some((item) => item.str.trim())) {
        return {
          ok: false,
          reason: "empty",
          message:
            "No text was found. This looks like a scanned image PDF, which is not supported yet.",
        };
      }
      return { ok: true, items, pageCount: pdf.numPages };
    } finally {
      await pdf.destroy();
    }
  } catch (error) {
    const pinReason = passwordReason(error);
    if (pinReason === "needs_pin") {
      return {
        ok: false,
        reason: "needs_pin",
        message: "This statement is PIN protected. Enter the PIN and try again.",
      };
    }
    if (pinReason === "wrong_pin") {
      return {
        ok: false,
        reason: "wrong_pin",
        message: "That PIN is incorrect. The file is still here — try again.",
      };
    }
    const message =
      error instanceof Error ? error.message : "Could not read this PDF.";
    return { ok: false, reason: "failed", message };
  }
}
