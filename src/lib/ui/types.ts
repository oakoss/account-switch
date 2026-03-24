export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
  hint?: string;
};

export type SelectOptions<T extends string | number> = {
  message: string;
  options: SelectOption<T>[];
};

export type OutputAdapter = {
  success(msg: string): void;
  error(msg: string): void;
  warn(msg: string): void;
  info(msg: string): void;
  hint(msg: string): void;
  blank(): void;
  log(msg: string): void;
};

export type PromptAdapter = {
  confirm(message: string): Promise<boolean>;
  select<T extends string | number>(opts: SelectOptions<T>): Promise<T | null>;
};
