
import React, { useState } from "react";
import CustomButton from "./ui/CustomButton";
import { CheckCircle, Copy, DownloadCloud, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface HSCodeResultProps {
  hsCode: string;
  description: string;
  confidence: number;
  onReset: () => void;
}

const HSCodeResult = ({ hsCode, description, confidence, onReset }: HSCodeResultProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(hsCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = `HS Code: ${hsCode}\nDescription: ${description}\nConfidence: ${confidence}%`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `hs-code-${hsCode}.txt`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  return (
    <div className="w-full max-w-2xl mx-auto animate-scale-in">
      <div className="mb-6 text-center">
        <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
          <CheckCircle size={14} className="mr-1" /> Analysis Complete
        </div>
        <h2 className="text-2xl font-semibold mb-2">Your HS Code Result</h2>
      </div>
      
      <div className="glass-card p-8 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 h-1 w-full bg-primary/20">
          <div 
            className="h-full bg-primary transition-all duration-1000 ease-out-expo" 
            style={{ width: `${confidence}%` }}
          ></div>
        </div>
        
        <div className="flex flex-col items-center">
          <div className="text-5xl font-bold tracking-tight mb-4 text-center">{hsCode}</div>
          
          <div className="text-center mb-6">
            <div className="text-sm font-medium text-muted-foreground mb-1">Classification Description</div>
            <p className="max-w-lg">{description}</p>
          </div>
          
          <div className="bg-secondary rounded-lg px-4 py-2 mb-8">
            <div className="text-sm">
              <span className="font-medium">Confidence:</span>{" "}
              <span className={cn(
                confidence > 85 ? "text-green-600" : 
                confidence > 70 ? "text-amber-600" : 
                "text-red-600"
              )}>
                {confidence}%
              </span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3 justify-center w-full">
            <CustomButton 
              onClick={handleCopy} 
              variant="outline" 
              className="flex-1 min-w-[120px]"
            >
              {copied ? <CheckCircle size={16} className="mr-2" /> : <Copy size={16} className="mr-2" />}
              {copied ? "Copied" : "Copy Code"}
            </CustomButton>
            
            <CustomButton 
              onClick={handleDownload} 
              variant="outline"
              className="flex-1 min-w-[120px]"
            >
              <DownloadCloud size={16} className="mr-2" />
              Download
            </CustomButton>
          </div>
          
          <button 
            onClick={onReset}
            className="mt-8 flex items-center text-muted-foreground text-sm hover:text-foreground transition-colors"
          >
            <RefreshCw size={14} className="mr-1" /> Start Over
          </button>
        </div>
      </div>
    </div>
  );
};

export default HSCodeResult;
