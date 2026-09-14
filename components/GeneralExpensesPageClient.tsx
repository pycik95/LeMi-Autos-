"use client";

import { useState } from "react";
import type { GeneralExpenseDTO } from "@/lib/types";
import GeneralExpenseTable from "@/components/GeneralExpenseTable";

export default function GeneralExpensesPageClient({
  initialExpenses,
}: {
  initialExpenses: GeneralExpenseDTO[];
}) {
  const [expenses, setExpenses] = useState<GeneralExpenseDTO[]>(initialExpenses);
  return <GeneralExpenseTable expenses={expenses} onExpensesChange={setExpenses} />;
}
