export function IsolatedText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <bdi dir="auto" className={className}>
      {children}
    </bdi>
  );
}
