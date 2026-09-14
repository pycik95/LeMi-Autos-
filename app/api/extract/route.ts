import { NextRequest, NextResponse } from "next/server";
import { extractDocumentFields, type DocumentType } from "@/lib/extractZulassung";

/** Recognizes a document scan (техпаспорт or счёт) before the car record exists yet (new-car flow). */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }
  const documentType = (formData.get("documentType") as DocumentType | null) ?? "zb1";

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await extractDocumentFields(buffer, file.type || "image/jpeg", documentType);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
  }
  return NextResponse.json({ fields: result.fields });
}
