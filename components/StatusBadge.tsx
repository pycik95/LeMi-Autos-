import { CAR_STATUS_LABELS } from "@/lib/finance";
import type { CarStatus } from "@/lib/types";

const STYLES: Record<CarStatus, string> = {
  IN_STOCK: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  SOLD: "bg-rose-50 text-rose-700 ring-rose-600/20",
  IN_PREP: "bg-orange-50 text-orange-700 ring-orange-600/20",
};

export default function StatusBadge({ status }: { status: CarStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${STYLES[status]}`}
    >
      {CAR_STATUS_LABELS[status]}
    </span>
  );
}
