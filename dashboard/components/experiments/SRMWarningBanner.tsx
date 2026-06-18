interface Props {
  observed: Record<string, number>;
  expected: Record<string, number>;
}

export function SRMWarningBanner({ observed, expected }: Props) {
  return (
    <div className="bg-red-950 border border-red-700 rounded p-4 text-sm text-red-200">
      <span className="font-semibold">⚠ Sample Ratio Mismatch detected.</span>{" "}
      Observed split {JSON.stringify(observed)} vs expected {JSON.stringify(expected)}.{" "}
      Do not trust these results until the underlying issue is resolved.
    </div>
  );
}
