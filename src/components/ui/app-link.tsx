import NextLink from "next/link";
import type { ComponentProps } from "react";

type AppLinkProps = ComponentProps<typeof NextLink>;

export default function AppLink(props: AppLinkProps) {
  return <NextLink {...props} prefetch={false} />;
}
