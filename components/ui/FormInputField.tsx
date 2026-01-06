"use client";

import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

export interface FormInputFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helpText?: string;
  type?: "text" | "url" | "number" | "password";
  min?: number;
  labelClassName?: string;
  helpTextClassName?: string;
}

export function FormInputField({
  id,
  label,
  value,
  onChange,
  placeholder,
  helpText,
  type = "text",
  min,
  labelClassName,
  helpTextClassName = "text-xs text-muted-foreground",
}: FormInputFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={labelClassName}>
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
      />
      {helpText && <p className={helpTextClassName}>{helpText}</p>}
    </div>
  );
}
