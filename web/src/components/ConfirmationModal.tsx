'use client';

export default function ConfirmationModal({
  taskTitle,
  action,
  onConfirm,
  onCancel,
}: {
  taskTitle: string;
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const getActionPhrase = (act: string) => {
    switch (act) {
      case 'pay_fee':
        return 'mark as paid';
      case 'submit_project':
        return 'submit and mark completed';
      default:
        return 'mark as done';
    }
  };

  const actionPhrase = getActionPhrase(action);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in-up">
      <div className="bg-[#121215] border border-zinc-800 rounded-xl p-6 max-w-md w-full shadow-2xl shadow-black">
        {/* Shield / Warning Icon */}
        <div className="flex items-center justify-center w-9 h-9 mx-auto mb-3 rounded-md bg-zinc-800 border border-zinc-700 text-amber-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Modal Prompt Header */}
        <h3 className="text-sm font-semibold text-center text-zinc-100 mb-1.5 tracking-tight">
          Confirm action: {actionPhrase} [{taskTitle}]
        </h3>

        {/* Description / Explanation */}
        <p className="text-xs text-center text-zinc-400 mb-5 leading-relaxed">
          Task is <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 uppercase">HUMAN_REQUIRED</span>. State mutation requires operator confirmation.
        </p>

        {/* Action Buttons */}
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-md border border-zinc-700 bg-zinc-800 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
