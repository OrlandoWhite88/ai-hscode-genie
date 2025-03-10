
import { TreeNode, pklTree } from './pklTree';

export interface ClassifierResult {
  code: string;
  description: string;
  confidence: number;
  path: string[];
}

export class HSClassifier {
  private tree: TreeNode;
  
  constructor(tree: TreeNode = pklTree) {
    this.tree = tree;
  }
  
  // Analyze product description to determine key features
  private analyzeDescription(description: string): Record<string, number> {
    const keywords: Record<string, number> = {};
    const words = description.toLowerCase().split(/\s+/);
    
    // Simple keyword extraction and weighting
    for (const word of words) {
      if (word.length > 2) { // Skip very short words
        keywords[word] = (keywords[word] || 0) + 1;
      }
    }
    
    return keywords;
  }
  
  // Match keywords to potential paths in the tree
  private findPotentialPaths(keywords: Record<string, number>): {node: TreeNode, path: string[], score: number}[] {
    const paths: {node: TreeNode, path: string[], score: number}[] = [];
    
    const traverseTree = (node: TreeNode, currentPath: string[], currentScore: number) => {
      // If we've reached a leaf node with a code
      if (node.code) {
        paths.push({
          node,
          path: [...currentPath],
          score: currentScore
        });
        return;
      }
      
      // If this is an internal node with options, explore each option
      if (node.options) {
        for (const [option, childNode] of Object.entries(node.options)) {
          // Calculate score for this option based on keyword matches
          let optionScore = currentScore;
          const optionWords = option.toLowerCase().split(/\s+/);
          
          for (const word of optionWords) {
            if (keywords[word]) {
              optionScore += keywords[word];
            }
          }
          
          // Recursively traverse child nodes
          traverseTree(childNode, [...currentPath, option], optionScore);
        }
      }
    };
    
    // Start traversal from the root
    traverseTree(this.tree, [], 0);
    
    // Sort paths by score in descending order
    return paths.sort((a, b) => b.score - a.score);
  }
  
  // Generate a confidence score between 0-100 based on the match quality
  private calculateConfidence(score: number, totalKeywords: number): number {
    if (totalKeywords === 0) return 50; // Default confidence if no keywords
    
    // A simple confidence calculation - can be made more sophisticated
    const rawConfidence = (score / totalKeywords) * 100;
    return Math.min(Math.max(Math.round(rawConfidence), 50), 99); // Limit between 50-99%
  }
  
  // Determine if we need more information
  public needsMoreInfo(description: string): {needsInfo: boolean, question?: string, options?: string[]} {
    const keywords = this.analyzeDescription(description);
    const keywordCount = Object.keys(keywords).length;
    
    // If very few keywords, we need more information
    if (keywordCount < 3) {
      return {
        needsInfo: true,
        question: "Could you provide more details about your product? What is it made of and what is its purpose?",
      };
    }
    
    const paths = this.findPotentialPaths(keywords);
    
    // If we have multiple high-scoring paths, ask a clarifying question
    if (paths.length > 1 && paths[0].score - paths[1].score < 2) {
      // Find a question to differentiate between the top paths
      const parentNodes = new Set<TreeNode>();
      for (const path of paths.slice(0, 3)) { // Consider top 3 paths
        let currentNode = this.tree;
        for (const step of path.path) {
          if (currentNode.options && currentNode.options[step]) {
            currentNode = currentNode.options[step];
            if (currentNode.question) {
              parentNodes.add(currentNode);
            }
          }
        }
      }
      
      // Use the first differentiating question we find
      for (const node of Array.from(parentNodes)) {
        return {
          needsInfo: true,
          question: node.question,
          options: node.options ? Object.keys(node.options) : undefined
        };
      }
    }
    
    return { needsInfo: false };
  }
  
  // Classify a product based on its description
  public classify(description: string): ClassifierResult | null {
    const keywords = this.analyzeDescription(description);
    const keywordCount = Object.keys(keywords).length;
    
    // Find potential classification paths
    const paths = this.findPotentialPaths(keywords);
    
    if (paths.length === 0) {
      return null; // No classification found
    }
    
    const bestMatch = paths[0];
    
    // Return the classification result
    return {
      code: bestMatch.node.code || "0000.00.00",
      description: bestMatch.node.description || "Unknown product",
      confidence: this.calculateConfidence(bestMatch.score, keywordCount),
      path: bestMatch.path
    };
  }
  
  // Process an answer to a specific question
  public processAnswer(question: string, answer: string, previousDescription: string): {
    updatedDescription: string,
    classification: ClassifierResult | null
  } {
    // Combine the previous description with the new information
    const updatedDescription = `${previousDescription} ${question.split('?')[0]}: ${answer}.`;
    
    // Attempt to classify with the updated description
    const classification = this.classify(updatedDescription);
    
    return {
      updatedDescription,
      classification
    };
  }
}

// Create and export a singleton instance for use throughout the app
export const hsClassifier = new HSClassifier();
