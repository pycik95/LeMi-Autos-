"use client";

import { useState } from "react";
import type { ServiceDTO } from "@/lib/types";
import ServiceTable from "@/components/ServiceTable";

export default function ServicesPageClient({ initialServices }: { initialServices: ServiceDTO[] }) {
  const [services, setServices] = useState<ServiceDTO[]>(initialServices);
  return <ServiceTable services={services} onServicesChange={setServices} />;
}
