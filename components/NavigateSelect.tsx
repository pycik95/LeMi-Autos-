"use client";

import { useRouter } from "next/navigation";

export default function NavigateSelect({
  value,
  options,
  baseUrl,
  paramName,
  className,
}: {
  value: string;
  options: { value: string; label: string }[];
  baseUrl: string;
  paramName: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <select
      value={value}
      onChange={(e) => {
        const url = new URL(baseUrl, window.location.origin);
        const params = url.searchParams;
        params.delete("page");
        if (e.target.value) params.set(paramName, e.target.value);
        else params.delete(paramName);
        router.push(`${url.pathname}?${params.toString()}`);
      }}
      className={className}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
