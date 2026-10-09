"use client";

import { createContext, useContext, type HTMLAttributes } from "react";
import { clsx } from "clsx";

const ApplicationSurfaceContext = createContext(false);

export function useApplicationSurface() {
  return useContext(ApplicationSurfaceContext);
}

export function ApplicationSurface({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <ApplicationSurfaceContext.Provider value>
      <div {...props} className={clsx("pc-ui", className)}>{children}</div>
    </ApplicationSurfaceContext.Provider>
  );
}
