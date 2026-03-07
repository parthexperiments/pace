"use client";

interface DeadlineWarningProps {
  warning: string;
  onAccept: () => void;
  onChangeDate: () => void;
}

export default function DeadlineWarning({
  warning,
  onAccept,
  onChangeDate,
}: DeadlineWarningProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
      <div className="w-full max-w-lg px-6">
        <div className="rounded-2xl border border-[#E8521A]/30 bg-[#E8521A]/5 p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E8521A]/20">
              <svg
                className="h-6 w-6 text-[#E8521A]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white">Honest assessment</h2>
          </div>

          <p className="mb-8 text-base leading-relaxed text-zinc-300">
            {warning}
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={onAccept}
              className="w-full rounded-lg bg-[#E8521A] px-6 py-3 text-base font-medium text-white transition-colors hover:bg-[#E8521A]/90"
            >
              I understand — let's go
            </button>
            <button
              onClick={onChangeDate}
              className="w-full rounded-lg border border-zinc-700 bg-transparent px-6 py-3 text-base font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-900"
            >
              Change my goal date
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
