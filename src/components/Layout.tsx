
import React from "react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

const Layout = ({ children, className }: LayoutProps) => {
  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <header className="w-full border-b border-border/40 backdrop-blur-sm bg-background/80 fixed top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <div className="h-5 w-5 rounded-md bg-primary animate-pulse-light"></div>
            </div>
            <h1 className="text-xl font-medium tracking-tight">HSCode Genie</h1>
          </div>
          <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
            <span className="text-xs font-medium">AI</span>
          </div>
        </div>
      </header>
      
      <main className={cn("flex-1 pt-16", className)}>
        <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-5xl">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
