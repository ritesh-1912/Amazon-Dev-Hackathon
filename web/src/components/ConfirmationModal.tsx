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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in-up">
      <div className="bg-[#18181b] border border-amber-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl shadow-black/80">
        {/* Shield / Warning Icon */}
        <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Modal Prompt Header */}
        <h3 className="text-base font-bold text-center text-white mb-2 tracking-tight">
          Confirm: {actionPhrase} [{taskTitle}]?
        </h3>

        {/* Description / Explanation */}
        <p className="text-xs text-center text-neutral-400 mb-6 leading-relaxed">
          This task is classified as <span className="text-purple-400 font-semibold uppercase">HUMAN_REQUIRED</span>. It alters real-world academic/financial state and requires your explicit confirmation before mutating.
        </p>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-700 bg-neutral-800/80 text-sm font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
