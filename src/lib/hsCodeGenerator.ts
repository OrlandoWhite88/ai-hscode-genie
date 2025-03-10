
import { useState } from "react";
import { hsClassifier, ClassifierResult } from "./hsClassifier";

// Types
export type GeneratorState = "idle" | "analyzing" | "questioning" | "generating" | "complete";

export interface HSResult {
  code: string;
  description: string;
  confidence: number;
}

export interface Question {
  id: string;
  text: string;
  options?: string[];
}

export const useHSCodeGenerator = () => {
  const [state, setState] = useState<GeneratorState>("idle");
  const [productDescription, setProductDescription] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<HSResult | null>(null);
  
  // Start the process with a product description
  const startAnalysis = async (description: string) => {
    setState("analyzing");
    setProductDescription(description);
    
    // Artificial delay to simulate processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if we need more information
    const { needsInfo, question, options } = hsClassifier.needsMoreInfo(description);
    
    if (needsInfo && question) {
      setState("questioning");
      setCurrentQuestion({
        id: `question_${Date.now()}`,
        text: question,
        options
      });
    } else {
      // If we have enough information, generate result
      setState("generating");
      
      // Artificial delay to simulate processing
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const classification = hsClassifier.classify(description);
      
      if (classification) {
        setResult({
          code: classification.code,
          description: classification.description,
          confidence: classification.confidence
        });
        setState("complete");
      } else {
        // If classification failed, ask for more information
        setState("questioning");
        setCurrentQuestion({
          id: `fallback_${Date.now()}`,
          text: "I couldn't determine the HS code with the given information. Could you provide more details about your product?",
        });
      }
    }
  };
  
  // Handle answering a question
  const answerQuestion = async (questionId: string, answer: string) => {
    setState("analyzing");
    
    // Save the answer
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
    
    // Process the answer
    const { updatedDescription, classification } = hsClassifier.processAnswer(
      currentQuestion?.text || "",
      answer,
      productDescription
    );
    
    // Update the product description with the new information
    setProductDescription(updatedDescription);
    
    // Artificial delay to simulate processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (classification && classification.confidence > 70) {
      // If we have a good classification, show the result
      setState("generating");
      
      // Artificial delay to simulate processing
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setResult({
        code: classification.code,
        description: classification.description,
        confidence: classification.confidence
      });
      setState("complete");
    } else {
      // Check if we need more information
      const { needsInfo, question, options } = hsClassifier.needsMoreInfo(updatedDescription);
      
      if (needsInfo && question) {
        setState("questioning");
        setCurrentQuestion({
          id: `question_${Date.now()}`,
          text: question,
          options
        });
      } else {
        // If we have enough information but no good classification, make a best guess
        setState("generating");
        
        // Artificial delay to simulate final processing
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        if (classification) {
          setResult({
            code: classification.code,
            description: classification.description,
            confidence: classification.confidence
          });
        } else {
          // Fallback to a default result if nothing else works
          setResult({
            code: "0000.00.00",
            description: "Unable to classify with the given information",
            confidence: 50
          });
        }
        setState("complete");
      }
    }
  };
  
  // Reset everything
  const reset = () => {
    setState("idle");
    setProductDescription("");
    setCurrentQuestion(null);
    setAnswers({});
    setResult(null);
  };
  
  return {
    state,
    productDescription,
    currentQuestion,
    answers,
    result,
    startAnalysis,
    answerQuestion,
    reset
  };
};
