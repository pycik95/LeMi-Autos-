"use client";

import type { CarFormState } from "@/lib/carForm";
import {
  psToKw,
  kwToPs,
  CAR_STATUS_LABELS,
  CAR_SOURCE_LABELS,
  FUEL_TYPE_LABELS,
  TRANSMISSION_LABELS,
  CAR_CONDITION_OPTIONS,
  BODY_TYPE_OPTIONS,
  DOORS_COUNT_OPTIONS,
  COLOR_OPTIONS,
  INTERIOR_MATERIAL_OPTIONS,
  FEATURE_GROUPS,
} from "@/lib/finance";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

function SelectField<K extends keyof CarFormState>({
  label,
  hint,
  value,
  options,
  field,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  options: string[];
  field: K;
  onChange: (field: K, value: CarFormState[K]) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <select
        className={inputCls}
        value={value}
        onChange={(e) => onChange(field, e.target.value as CarFormState[K])}
      >
        <option value="">Bitte wählen</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </Field>
  );
}

function toggleFeature(current: string, code: string): string {
  const set = new Set(current ? current.split(",") : []);
  if (set.has(code)) set.delete(code);
  else set.add(code);
  return Array.from(set).join(",");
}

export default function CarFields({
  state,
  onChange,
}: {
  state: CarFormState;
  onChange: <K extends keyof CarFormState>(field: K, value: CarFormState[K]) => void;
}) {
  const psValue = state.powerKw && Number.isFinite(Number(state.powerKw))
    ? kwToPs(Number(state.powerKw)).toFixed(0)
    : "";
  const activeFeatures = new Set(state.features ? state.features.split(",") : []);

  return (
    <div>
      <Section title="Основные данные">
        <Field label="VIN *" hint="ключ дедупликации — обязательно">
          <input
            className={inputCls}
            value={state.vin}
            onChange={(e) => onChange("vin", e.target.value.toUpperCase())}
            maxLength={17}
          />
        </Field>
        <Field label="Марка *">
          <input
            className={inputCls}
            value={state.make}
            onChange={(e) => onChange("make", e.target.value)}
            placeholder="BMW"
          />
        </Field>
        <Field label="Модель *">
          <input
            className={inputCls}
            value={state.model}
            onChange={(e) => onChange("model", e.target.value)}
            placeholder="320d"
          />
        </Field>
        <SelectField
          label="Цвет"
          hint="Außenfarbe"
          value={state.color}
          options={COLOR_OPTIONS}
          field="color"
          onChange={onChange}
        />
        <Field label="Прежние номера">
          <input
            className={inputCls}
            value={state.previousPlates}
            onChange={(e) => onChange("previousPlates", e.target.value)}
          />
        </Field>
        <Field label="Дата первой регистрации">
          <input
            type="date"
            className={inputCls}
            value={state.firstRegistration}
            onChange={(e) => onChange("firstRegistration", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Технические данные">
        <Field label="Объём двигателя, см³">
          <input
            type="number"
            className={inputCls}
            value={state.displacementCcm}
            onChange={(e) => onChange("displacementCcm", e.target.value)}
          />
        </Field>
        <Field label="Мощность, кВт" hint={state.powerKwEstimated ? "расчётное значение (из PS)" : undefined}>
          <input
            type="number"
            step="0.01"
            className={inputCls}
            value={state.powerKw}
            onChange={(e) => {
              onChange("powerKw", e.target.value);
              onChange("powerKwEstimated", false);
            }}
          />
        </Field>
        <Field label="Мощность, PS" hint="считается автоматически из кВт">
          <input
            type="number"
            className={inputCls}
            placeholder="напр. 190"
            value={psValue}
            onChange={(e) => {
              const raw = e.target.value;
              const ps = Number(raw);
              if (raw !== "" && Number.isFinite(ps) && ps > 0) {
                onChange("powerKw", psToKw(ps).toFixed(1));
                onChange("powerKwEstimated", true);
              } else if (raw === "") {
                onChange("powerKw", "");
              }
            }}
          />
        </Field>
        <Field label="Пробег, км" hint="как есть из счёта">
          <input
            type="number"
            className={inputCls}
            value={state.mileageKm}
            onChange={(e) => onChange("mileageKm", e.target.value)}
          />
        </Field>
        <Field label="Кол-во владельцев" hint="число у последнего владельца + 1">
          <input
            type="number"
            className={inputCls}
            value={state.owners}
            onChange={(e) => onChange("owners", e.target.value)}
          />
        </Field>
        <Field label="Номер ZB II">
          <input
            className={inputCls}
            value={state.zb2Number}
            onChange={(e) => onChange("zb2Number", e.target.value)}
          />
        </Field>
        <Field label="Топливо" hint="Kraftstoffart">
          <select
            className={inputCls}
            value={state.fuelType}
            onChange={(e) => onChange("fuelType", e.target.value as CarFormState["fuelType"])}
          >
            {Object.entries(FUEL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Техосмотр (HU/AU) до">
          <input
            type="date"
            className={inputCls}
            value={state.tuvUntil}
            onChange={(e) => onChange("tuvUntil", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Для объявления">
        <SelectField
          label="Состояние"
          hint="Fahrzeugzustand"
          value={state.condition}
          options={CAR_CONDITION_OPTIONS}
          field="condition"
          onChange={onChange}
        />
        <Field label="Коробка передач" hint="Getriebe">
          <select
            className={inputCls}
            value={state.transmission}
            onChange={(e) => onChange("transmission", e.target.value as CarFormState["transmission"])}
          >
            <option value="">Bitte wählen</option>
            {Object.entries(TRANSMISSION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <SelectField
          label="Тип кузова"
          hint="Fahrzeugtyp"
          value={state.bodyType}
          options={BODY_TYPE_OPTIONS}
          field="bodyType"
          onChange={onChange}
        />
        <SelectField
          label="Кол-во дверей"
          hint="Anzahl Türen"
          value={state.doors}
          options={DOORS_COUNT_OPTIONS}
          field="doors"
          onChange={onChange}
        />
        <Field label="Экологический класс" hint="Umweltplakette">
          <input
            className={inputCls}
            value={state.umweltplakette}
            onChange={(e) => onChange("umweltplakette", e.target.value)}
            placeholder="4 (Grün)"
          />
        </Field>
        <Field label="Класс токсичности" hint="Schadstoffklasse">
          <input
            className={inputCls}
            value={state.emissionClass}
            onChange={(e) => onChange("emissionClass", e.target.value)}
            placeholder="Euro4"
          />
        </Field>
        <SelectField
          label="Материал салона"
          hint="Material Innenausstattung"
          value={state.interiorMaterial}
          options={INTERIOR_MATERIAL_OPTIONS}
          field="interiorMaterial"
          onChange={onChange}
        />
      </Section>

      <Section title="Комплектация">
        <div className="col-span-2 md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="text-xs font-medium text-slate-500 mb-2">{group.title}</div>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <label key={item.code} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={activeFeatures.has(item.code)}
                      onChange={() => onChange("features", toggleFeature(state.features, item.code))}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Закупка">
        <Field label="Аукцион">
          <select
            className={inputCls}
            value={state.source}
            onChange={(e) => onChange("source", e.target.value as CarFormState["source"])}
          >
            <option value="">—</option>
            {Object.entries(CAR_SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Номер лота">
          <input
            className={inputCls}
            value={state.lotNumber}
            onChange={(e) => onChange("lotNumber", e.target.value)}
          />
        </Field>
        <Field label="Дата счёта" hint="Rechnungsdatum — по ней раскладывается архив">
          <input
            type="date"
            className={inputCls}
            value={state.invoiceDate}
            onChange={(e) => onChange("invoiceDate", e.target.value)}
          />
        </Field>
        <Field label="Закупочная цена, €" hint="только цена машины из счёта, §25a">
          <input
            type="number"
            step="0.01"
            className={inputCls}
            value={state.purchasePrice}
            onChange={(e) => onChange("purchasePrice", e.target.value)}
          />
        </Field>
        <Field label="Дата поступления на склад">
          <input
            type="date"
            className={inputCls}
            value={state.arrivedAt}
            onChange={(e) => onChange("arrivedAt", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Продажа и статус">
        <Field label="Продажная цена, €">
          <input
            type="number"
            step="0.01"
            className={inputCls}
            value={state.salePrice}
            onChange={(e) => onChange("salePrice", e.target.value)}
          />
        </Field>
        <Field label="Статус">
          <select
            className={inputCls}
            value={state.status}
            onChange={(e) => onChange("status", e.target.value as CarFormState["status"])}
          >
            {Object.entries(CAR_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Дата продажи">
          <input
            type="date"
            className={inputCls}
            value={state.soldAt}
            onChange={(e) => onChange("soldAt", e.target.value)}
          />
        </Field>
        <Field label="Схема налогообложения" hint="меняется только в редких случаях — уточнить у бухгалтера">
          <select
            className={inputCls}
            value={state.taxScheme}
            onChange={(e) => onChange("taxScheme", e.target.value as CarFormState["taxScheme"])}
          >
            <option value="MARGIN_25A">Differenzbesteuerung §25a (по умолчанию)</option>
            <option value="REGULAR_19">Regelbesteuerung — обычный НДС 19%</option>
          </select>
        </Field>
        {state.taxScheme === "REGULAR_19" && (
          <Field label="Входящий НДС на закупку, €" hint="только при Regelbesteuerung — вычитается из НДС к уплате">
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={state.purchaseVat}
              onChange={(e) => onChange("purchaseVat", e.target.value)}
            />
          </Field>
        )}
      </Section>

      <Section title="Заметки">
        <div className="col-span-2 md:col-span-3">
          <textarea
            className={inputCls}
            rows={4}
            value={state.notes}
            onChange={(e) => onChange("notes", e.target.value)}
          />
        </div>
      </Section>
    </div>
  );
}
