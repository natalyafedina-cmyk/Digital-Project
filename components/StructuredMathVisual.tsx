type StructuredMathVisualProps = {
  content: string;
  answer?: string;
};

function extractColumnMultiplication(content: string) {
  const direct = content.match(/(\d+)\s*[×xX*]\s*(\d+)/);
  if (direct) {
    return { top: direct[1], bottom: direct[2] };
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let top = "";
  let bottom = "";

  for (const line of lines) {
    if (!top && /^\d+$/.test(line)) {
      top = line;
      continue;
    }

    const operator = line.match(/^[×xX*]\s*(\d+)$/);
    if (top && operator) {
      bottom = operator[1];
      break;
    }
  }

  return top && bottom ? { top, bottom } : null;
}

function extractShownResults(content: string, top: string, bottom: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const values: string[] = [];
  let operandsSeen = 0;

  for (const line of lines) {
    const plain = line.match(/^\d+$/)?.[0];
    const operator = line.match(/^[×xX*]\s*(\d+)$/)?.[1];

    if (plain === top && operandsSeen === 0) {
      operandsSeen = 1;
      continue;
    }

    if (operator === bottom && operandsSeen <= 1) {
      operandsSeen = 2;
      continue;
    }

    if (operandsSeen >= 2 && plain && !values.includes(plain)) {
      values.push(plain);
    }
  }

  return values.slice(0, 3);
}

export default function StructuredMathVisual({
  content,
  answer = "",
}: StructuredMathVisualProps) {
  const source = [content, answer].filter(Boolean).join("\n");
  const multiplication = extractColumnMultiplication(source);

  if (!multiplication) {
    return (
      <pre className="mt-3 overflow-x-auto rounded-2xl border border-violet-200 bg-white px-4 py-3 font-mono text-[15px] leading-7 text-slate-900 whitespace-pre">
        {content}
      </pre>
    );
  }

  const { top, bottom } = multiplication;
  const shownResults = extractShownResults(content, top, bottom);
  const maxDigits = Math.max(
    3,
    top.length,
    bottom.length,
    top.length + bottom.length,
    ...shownResults.map((value) => value.length)
  );

  const renderNumber = (value: string, prefix = "") => {
    const cells = value.padStart(maxDigits, " ").split("");

    return (
      <>
        <div className="flex h-10 w-7 items-center justify-center text-xl font-bold text-violet-600">
          {prefix}
        </div>
        {cells.map((char, index) => (
          <div
            key={`${value}-${index}`}
            className="flex h-10 min-w-9 items-center justify-center rounded-md text-xl font-semibold tabular-nums text-slate-900"
          >
            {char === " " ? "" : char}
          </div>
        ))}
      </>
    );
  };

  const renderBlankRow = (key: string) => (
    <>
      <div />
      {Array.from({ length: maxDigits }).map((_, index) => (
        <div
          key={`${key}-${index}`}
          className="mx-0.5 h-9 min-w-9 rounded-md border-2 border-dashed border-violet-200 bg-white"
        />
      ))}
    </>
  );

  return (
    <div className="mt-3 rounded-2xl border border-violet-200 bg-white p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-violet-500">
        Умножение столбиком
      </div>

      <div className="mx-auto w-fit rounded-2xl bg-violet-50/60 p-4">
        <div
          className="grid items-center gap-x-1"
          style={{
            gridTemplateColumns: `28px repeat(${maxDigits}, minmax(36px, 42px))`,
          }}
        >
          {renderNumber(top)}
          {renderNumber(bottom, "×")}

          <div />
          <div
            className="my-1 h-0.5 bg-slate-500"
            style={{ gridColumn: `2 / span ${maxDigits}` }}
          />

          {shownResults.length > 0
            ? shownResults.slice(0, 2).map((value) => renderNumber(value))
            : (
              <>
                {renderBlankRow("partial-1")}
                {renderBlankRow("partial-2")}
              </>
            )}

          <div />
          <div
            className="my-1 h-0.5 bg-slate-500"
            style={{ gridColumn: `2 / span ${maxDigits}` }}
          />

          {shownResults.length >= 3
            ? renderNumber(shownResults[2])
            : renderBlankRow("final")}
        </div>
      </div>

      {shownResults.length === 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Заполняй строки по шагам — готовый ответ здесь специально не показан.
        </p>
      )}
    </div>
  );
}
