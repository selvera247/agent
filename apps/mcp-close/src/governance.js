export function toolResult(payload, { humanGate = false, citations = [] } = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            ...payload,
            governance: {
              human_gate_required: humanGate,
              citations,
              note: humanGate
                ? "Draft or status change — human approve/edit/reject before treating as final."
                : "Read/query only — cite returned account/txn IDs in any commentary.",
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

export function toolError(error) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: error.message,
          governance: {
            human_gate_required: true,
            note: "Tool failed — do not invent flux drivers.",
          },
        }),
      },
    ],
    isError: true,
  };
}
