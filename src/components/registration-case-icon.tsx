import type { SVGProps } from "react";

export function RegistrationCaseIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="m2 16 4.039-9.69a.5.5 0 0 1 .922 0L11 16" />
      <path d="M3.304 13h6.392" />
      <text
        x="12"
        y="18.5"
        fill="currentColor"
        stroke="none"
        fontFamily="inherit"
        fontSize="19.5"
        fontWeight="400"
      >
        a
      </text>
    </svg>
  );
}
