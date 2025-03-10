
// PKL Tree implementation for Harmonized System (HS) code classification

export interface TreeNode {
  question: string;
  options?: { [key: string]: TreeNode };
  code?: string;
  description?: string;
}

// Sample PKL tree structure
// This is a simplified version - you would replace this with your full tree
export const pklTree: TreeNode = {
  question: "What is the primary material of the product?",
  options: {
    "Textile materials": {
      question: "What specific textile material is it made of?",
      options: {
        "Cotton": {
          question: "Is it apparel/clothing?",
          options: {
            "Yes": {
              question: "Is it knitted or crocheted?",
              options: {
                "Yes": {
                  code: "6109.10.00",
                  description: "T-shirts, singlets, tank tops and similar garments, knitted or crocheted, of cotton"
                },
                "No": {
                  code: "6205.20.00",
                  description: "Men's or boys' shirts, not knitted or crocheted, of cotton"
                }
              }
            },
            "No": {
              question: "Is it for home furnishing?",
              options: {
                "Yes": {
                  code: "6302.31.00",
                  description: "Bed linen, of cotton, not knitted or crocheted"
                },
                "No": {
                  code: "5208.11.00",
                  description: "Woven fabrics of cotton, containing 85% or more cotton by weight, unbleached, plain weave"
                }
              }
            }
          }
        },
        "Synthetic fibers": {
          code: "5407.10.00",
          description: "Woven fabrics obtained from high tenacity yarn of nylon or other polyamides or of polyesters"
        }
      }
    },
    "Metals": {
      question: "What specific metal is it made of?",
      options: {
        "Iron or Steel": {
          question: "Is it a tool or implement?",
          options: {
            "Yes": {
              code: "8205.59.80",
              description: "Other handtools (including glass cutters) not elsewhere specified or included"
            },
            "No": {
              code: "7326.90.86",
              description: "Other articles of iron or steel"
            }
          }
        },
        "Aluminum": {
          code: "7616.99.90",
          description: "Other articles of aluminum"
        }
      }
    },
    "Plastics": {
      question: "What is the shape or form of the plastic product?",
      options: {
        "Film or sheet": {
          code: "3920.10.00",
          description: "Other plates, sheets, film, foil and strip, of polymers of ethylene, non-cellular and not reinforced"
        },
        "Molded product": {
          code: "3926.90.99",
          description: "Other articles of plastics"
        }
      }
    },
    "Wood": {
      question: "Is it furniture?",
      options: {
        "Yes": {
          code: "9403.60.80",
          description: "Other wooden furniture"
        },
        "No": {
          code: "4421.99.99",
          description: "Other articles of wood"
        }
      }
    },
    "Electronic components": {
      question: "Is it a complete electronic device?",
      options: {
        "Yes": {
          question: "What type of electronic device is it?",
          options: {
            "Computer or laptop": {
              code: "8471.30.01",
              description: "Portable automatic data processing machines, weighing not more than 10 kg"
            },
            "Mobile phone": {
              code: "8517.12.00",
              description: "Telephones for cellular networks or other wireless networks"
            }
          }
        },
        "No": {
          code: "8517.71.00",
          description: "Antennas and antenna reflectors of all kinds; parts suitable for use therewith"
        }
      }
    }
  }
};

// Replace this with the full implementation from the GitHub repository
// The above is just a sample structure to demonstrate the concept
