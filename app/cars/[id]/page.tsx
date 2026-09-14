import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import CarDetailClient from "@/components/CarDetailClient";
import { carToDTO } from "@/lib/serialize";
import { ARCHIVE_ROOT, archiveFolderFor } from "@/lib/archive";

export default async function CarDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const car = await prisma.car.findUnique({
    where: { id },
    include: {
      expenses: { orderBy: { date: "desc" } },
      attachments: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }] },
      privateEntries: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
    },
  });

  if (!car) notFound();

  // Папка архива определяется датой счёта (раздел 6 ТЗ), а не датой приезда на склад.
  const suggestedFolder = car.invoiceDate
    ? archiveFolderFor(car.invoiceDate, "Rechnungen")
    : null;

  return (
    <CarDetailClient
      car={carToDTO(car)}
      archiveRoot={ARCHIVE_ROOT}
      suggestedFolder={suggestedFolder}
    />
  );
}
