import os
import sys
import pickle
import json
import time
import logging
import argparse
import re
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime

# OpenAI API (only needed for classification)
try:
    import openai
except ImportError:
    openai = None

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Use environment variable for API key
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")  # Get API key from environment variable

#########################################################
# SHARED CLASS DEFINITIONS (needed for pickle compatibility)
#########################################################

class HSNode:
    """Node in the HS code hierarchy"""
    def __init__(self, data: Dict[str, Any]):
        self.htsno: str = data.get("htsno", "")
        self.description: str = data.get("description", "")
        self.indent: int = int(data.get("indent", 0))
        self.superior: bool = data.get("superior") == "true"
        self.units: List[str] = data.get("units", [])
        self.general: str = data.get("general", "")
        self.special: str = data.get("special", "")
        self.other: str = data.get("other", "")
        self.footnotes: List[Dict[str, Any]] = data.get("footnotes", [])
        self.children: List['HSNode'] = []
        self.full_context: List[str] = []
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "htsno": self.htsno,
            "description": self.description,
            "indent": self.indent,
            "superior": self.superior,
            "units": self.units,
            "general": self.general,
            "special": self.special,
            "other": self.other,
            "full_path": " > ".join(self.full_context + [self.description]),
            "children": [child.to_dict() for child in self.children]
        }


class HSCodeTree:
    """Manager for the HS code hierarchy"""
    def __init__(self):
        self.root = HSNode({"description": "HS Classification Root", "indent": -1})
        self.last_updated = datetime.now()
        self.code_index = {}  # Maps HS codes to nodes
    
    def build_from_flat_json(self, data: List[Dict[str, Any]]) -> None:
        """Build tree from flat JSON data"""
        logger.info(f"Building tree from {len(data)} items...")
        
        # Sort by indent to ensure parent nodes are processed before children
        sorted_data = sorted(data, key=lambda x: int(x.get("indent", 0)))
        
        # Stack to track the current node at each indent level
        stack = [self.root]
        
        for i, item in enumerate(sorted_data):
            if i % 1000 == 0 and i > 0:
                logger.info(f"Processed {i} items...")
                
            # Create new node
            node = HSNode(item)
            current_indent = node.indent
            
            # Adjust stack to find correct parent
            while len(stack) > current_indent + 1:
                stack.pop()
            
            # Get parent from stack
            parent = stack[-1]
            
            # Update node's context with parent's context
            node.full_context = parent.full_context.copy()
            if parent.description:
                node.full_context.append(parent.description)
            
            # Add node to parent's children
            parent.children.append(node)
            
            # Add to stack if this node could have children
            if node.superior or node.indent < 9:
                stack.append(node)
            
            # Add to index if it has an HS code
            if node.htsno and node.htsno.strip():
                self.code_index[node.htsno] = node
        
        logger.info(f"Tree built successfully with {len(self.code_index)} indexed codes")
    
    def save(self, filepath: str) -> None:
        """Save the tree to a file"""
        logger.info(f"Saving tree to {filepath}...")
        with open(filepath, 'wb') as f:
            pickle.dump(self, f)
        logger.info("Tree saved successfully")
    
    @classmethod
    def load(cls, filepath: str) -> 'HSCodeTree':
        """Load a tree from a file"""
        logger.info(f"Loading tree from {filepath}...")
        with open(filepath, 'rb') as f:
            tree = pickle.load(f)
        logger.info(f"Tree loaded successfully with {len(tree.code_index)} indexed codes")
        return tree
    
    def print_stats(self) -> None:
        """Print statistics about the tree"""
        total_nodes = self._count_nodes(self.root)
        max_depth = self._max_depth(self.root)
        chapters = [child for child in self.root.children if child.htsno and len(child.htsno.strip()) == 2]
        
        print("\nHS Code Tree Statistics:")
        print(f"Total nodes: {total_nodes}")
        print(f"Indexed codes: {len(self.code_index)}")
        print(f"Maximum depth: {max_depth}")
        print(f"Number of chapters: {len(chapters)}")
        print(f"Last updated: {self.last_updated}")
    
    def _count_nodes(self, node: HSNode) -> int:
        """Count total nodes in tree"""
        count = 1  # Count the current node
        for child in node.children:
            count += self._count_nodes(child)
        return count
    
    def _max_depth(self, node: HSNode, current_depth: int = 0) -> int:
        """Find maximum depth of tree"""
        if not node.children:
            return current_depth
        
        max_child_depth = 0
        for child in node.children:
            child_depth = self._max_depth(child, current_depth + 1)
            max_child_depth = max(max_child_depth, child_depth)
        
        return max_child_depth
    
    def find_child_codes(self, parent_code: str) -> List[str]:
        """
        Find all immediate child codes of a parent code using pattern matching
        
        For example:
        - Children of "" (empty) would include "01", "02", etc.
        - Children of "01" would include "0101", "0102", etc.
        - Children of "0101" would include "0101.21", "0101.29", etc.
        """
        all_codes = list(self.code_index.keys())
        
        # For the root level, return all 2-digit codes
        if not parent_code:
            return [code for code in all_codes if re.match(r'^\d{2}$', code)]
        
        # For 2-digit codes (e.g., "01"), find 4-digit codes starting with it
        if re.match(r'^\d{2}$', parent_code):
            pattern = f'^{parent_code}\\d{{2}}$'
            return [code for code in all_codes if re.match(pattern, code)]
        
        # For 4-digit codes (e.g., "0101"), find 6-digit codes
        if re.match(r'^\d{4}$', parent_code):
            pattern = f'^{parent_code}\\.\\d{{2}}'
            return [code for code in all_codes if re.match(pattern, code)]
        
        # For 6-digit codes (e.g., "0101.21"), find 8-digit codes
        if re.match(r'^\d{4}\.\d{2}$', parent_code):
            pattern = f'^{parent_code}\\.\\d{{2}}'
            return [code for code in all_codes if re.match(pattern, code)]
        
        # For 8-digit codes (e.g., "0101.21.00"), find 10-digit codes
        if re.match(r'^\d{4}\.\d{2}\.\d{2}$', parent_code):
            pattern = f'^{parent_code}\\.\\d{{2}}'
            return [code for code in all_codes if re.match(pattern, code)]
        
        # Default - return empty list if pattern doesn't match
        return []


#########################################################
# TREE BUILDER FUNCTIONS
#########################################################

def build_and_save_tree(json_filepath: str, output_filepath: str = "hs_code_tree.pkl") -> HSCodeTree:
    """Build tree from JSON data and save it"""
    try:
        # Ensure output directory exists
        output_dir = os.path.dirname(output_filepath)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir)
        
        # Load JSON data
        logger.info(f"Loading JSON data from {json_filepath}...")
        with open(json_filepath, 'r') as f:
            data = json.load(f)
        logger.info(f"Loaded {len(data)} items from JSON")
        
        # Build tree
        tree = HSCodeTree()
        tree.build_from_flat_json(data)
        
        # Print statistics
        tree.print_stats()
        
        # Save tree
        tree.save(output_filepath)
        
        return tree
        
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON file: {e}")
        return None
    except Exception as e:
        logger.error(f"Error building tree: {e}")
        return None


#########################################################
# CLASSIFIER FUNCTIONS
#########################################################

class HSCodeClassifier:
    """Classifier that uses OpenAI to navigate the HS code tree"""
    
    def __init__(self, tree_path: str, api_key: str = None):
        """
        Initialize the classifier
        
        Args:
            tree_path: Path to the pickled HSCodeTree
            api_key: OpenAI API key (if None, looks for OPENAI_API_KEY env var)
        """
        # Load tree
        self.tree = self._load_tree(tree_path)
        
        # Set up OpenAI client
        if openai is None:
            raise ImportError("OpenAI package is required for classification. Install with: pip install openai")
        
        self.client = openai.OpenAI(api_key=api_key)
        
        # Track classification progress
        self.steps = []
        
        # Fixed chapters map for direct access
        self._init_chapters_map()
    
    def _init_chapters_map(self):
        """Initialize the chapters map for quick reference"""
        self.chapters_map = {
            1: "Live animals",
            2: "Meat and edible meat offal",
            3: "Fish and crustaceans, molluscs and other aquatic invertebrates",
            4: "Dairy produce; birds eggs; natural honey; edible products of animal origin",
            5: "Products of animal origin, not elsewhere specified or included",
            6: "Live trees and other plants; bulbs, roots and the like; cut flowers",
            7: "Edible vegetables and certain roots and tubers",
            8: "Edible fruit and nuts; peel of citrus fruit or melons",
            9: "Coffee, tea, maté and spices",
            10: "Cereals",
            11: "Products of the milling industry; malt; starches; inulin; wheat gluten",
            12: "Oil seeds and oleaginous fruits; miscellaneous grains, seeds and fruits",
            13: "Lac; gums, resins and other vegetable saps and extracts",
            14: "Vegetable plaiting materials; vegetable products not elsewhere specified",
            15: "Animal or vegetable fats and oils and their cleavage products",
            16: "Preparations of meat, of fish or of crustaceans, molluscs",
            17: "Sugars and sugar confectionery",
            18: "Cocoa and cocoa preparations",
            19: "Preparations of cereals, flour, starch or milk; bakers' wares",
            20: "Preparations of vegetables, fruit, nuts or other parts of plants",
            21: "Miscellaneous edible preparations",
            22: "Beverages, spirits and vinegar",
            23: "Residues and waste from the food industries; prepared animal feed",
            24: "Tobacco and manufactured tobacco substitutes",
            25: "Salt; sulfur; earths and stone; plastering materials, lime and cement",
            26: "Ores, slag and ash",
            27: "Mineral fuels, mineral oils and products of their distillation",
            28: "Inorganic chemicals; organic or inorganic compounds of precious metals",
            29: "Organic chemicals",
            30: "Pharmaceutical products",
            31: "Fertilizers",
            32: "Tanning or dyeing extracts; dyes, pigments, paints, varnishes",
            33: "Essential oils and resinoids; perfumery, cosmetic or toilet preparations",
            34: "Soap, organic surface-active agents, washing preparations",
            35: "Albuminoidal substances; modified starches; glues; enzymes",
            36: "Explosives; pyrotechnic products; matches; pyrophoric alloys",
            37: "Photographic or cinematographic goods",
            38: "Miscellaneous chemical products",
            39: "Plastics and articles thereof",
            40: "Rubber and articles thereof",
            41: "Raw hides and skins (other than furskins) and leather",
            42: "Articles of leather; saddlery and harness; travel goods, handbags",
            43: "Furskins and artificial fur; manufactures thereof",
            44: "Wood and articles of wood; wood charcoal",
            45: "Cork and articles of cork",
            46: "Manufactures of straw, of esparto or of other plaiting materials",
            47: "Pulp of wood or of other fibrous cellulosic material",
            48: "Paper and paperboard; articles of paper pulp, of paper or of paperboard",
            49: "Printed books, newspapers, pictures and other products of the printing industry",
            50: "Silk",
            51: "Wool, fine or coarse animal hair; horsehair yarn and woven fabric",
            52: "Cotton",
            53: "Other vegetable textile fibers; paper yarn and woven fabric of paper yarn",
            54: "Man-made filaments",
            55: "Man-made staple fibers",
            56: "Wadding, felt and nonwovens; special yarns, twine, cordage, ropes",
            57: "Carpets and other textile floor coverings",
            58: "Special woven fabrics; tufted textile fabrics; lace, tapestries",
            59: "Impregnated, coated, covered or laminated textile fabrics",
            60: "Knitted or crocheted fabrics",
            61: "Articles of apparel and clothing accessories, knitted or crocheted",
            62: "Articles of apparel and clothing accessories, not knitted or crocheted",
            63: "Other made up textile articles; sets; worn clothing and worn textile articles",
            64: "Footwear, gaiters and the like; parts of such articles",
            65: "Headgear and parts thereof",
            66: "Umbrellas, sun umbrellas, walking sticks, seatsticks, whips, riding-crops",
            67: "Prepared feathers and down and articles made of feathers or of down",
            68: "Articles of stone, plaster, cement, asbestos, mica or similar materials",
            69: "Ceramic products",
            70: "Glass and glassware",
            71: "Natural or cultured pearls, precious or semiprecious stones, precious metals",
            72: "Iron and steel",
            73: "Articles of iron or steel",
            74: "Copper and articles thereof",
            75: "Nickel and articles thereof",
            76: "Aluminum and articles thereof",
            78: "Lead and articles thereof",
            79: "Zinc and articles thereof",
            80: "Tin and articles thereof",
            81: "Other base metals; cermets; articles thereof",
            82: "Tools, implements, cutlery, spoons and forks, of base metal",
            83: "Miscellaneous articles of base metal",
            84: "Nuclear reactors, boilers, machinery and mechanical appliances",
            85: "Electrical machinery and equipment and parts thereof",
            86: "Railway or tramway locomotives, rolling-stock and parts thereof",
            87: "Vehicles other than railway or tramway rolling stock",
            88: "Aircraft, spacecraft, and parts thereof",
            89: "Ships, boats and floating structures",
            90: "Optical, photographic, cinematographic, measuring, checking, precision instruments",
            91: "Clocks and watches and parts thereof",
            92: "Musical instruments; parts and accessories of such articles",
            93: "Arms and ammunition; parts and accessories thereof",
            94: "Furniture; bedding, mattresses, mattress supports, cushions",
            95: "Toys, games and sports requisites; parts and accessories thereof",
            96: "Miscellaneous manufactured articles",
            97: "Works of art, collectors' pieces and antiques",
            98: "Special classification provisions",
            99: "Temporary legislation; temporary modifications"
        }
    
    def _load_tree(self, tree_path: str) -> HSCodeTree:
        """Load the HS code tree from pickle file"""
        try:
            logger.info(f"Loading HS code tree from {tree_path}")
            with open(tree_path, 'rb') as f:
                tree = pickle.load(f)
            logger.info(f"Tree loaded successfully with {len(tree.code_index)} codes")
            return tree
        except Exception as e:
            logger.error(f"Failed to load tree: {e}")
            raise
    
    def determine_chapter(self, product_description: str) -> str:
        """
        Determine the most appropriate chapter (2-digit code) for a product
        
        Args:
            product_description: Description of the product to classify
            
        Returns:
            Two-digit chapter code (e.g., "01", "84", etc.)
        """
        # Create a prompt with chapters list
        chapter_list = "\n".join([
            f"{num:02d}: {desc}" for num, desc in sorted(self.chapters_map.items())
        ])
        
        prompt = f"""Determine the most appropriate HS code chapter for this product:

PRODUCT: {product_description}

CHAPTERS:
{chapter_list}

INSTRUCTIONS:
Return ONLY the 2-digit chapter number (01-99) that best matches this product.
Format your answer as a 2-digit number (e.g., "01", "27", "84").
"""
        
        logger.info(f"Sending chapter determination prompt to OpenAI")
        try:
            response = self.client.chat.completions.create(
                model="o3-mini",  
                messages=[
                    {"role": "system", "content": "You are a customs classification expert."},
                    {"role": "user", "content": prompt}
                ]
            )
            chapter_response = response.choices[0].message.content.strip()
            
            # Extract chapter number
            match = re.search(r'(\d{2})', chapter_response)
            if match:
                chapter = match.group(1)
                logger.info(f"Selected chapter: {chapter}")
                return chapter
            else:
                logger.warning(f"Could not parse chapter number from response: {chapter_response}")
                return ""
        except Exception as e:
            logger.error(f"Error determining chapter: {e}")
            return ""
    
    def get_children(self, code: str = "") -> List[Dict[str, Any]]:
        """Get child nodes of the given code using pattern matching"""
        # Use the more robust pattern-based child finding method
        child_codes = self.tree.find_child_codes(code)
        
        if not child_codes:
            return []
        
        # Get the node objects from the index
        result = []
        for child_code in child_codes:
            child = self.tree.code_index.get(child_code)
            if child:
                result.append({
                    "code": child.htsno,
                    "description": child.description,
                    "general": child.general,
                    "special": child.special,
                    "other": child.other
                })
        
        return result
    
    def _format_options(self, options: List[Dict[str, Any]]) -> str:
        """Format options for inclusion in a prompt"""
        formatted = []
        for i, opt in enumerate(options, 1):
            line = f"{i}. {opt['code']}: {opt['description']}"
            if opt.get('general') and opt['general'].strip():
                line += f" (Duty: {opt['general']})"
            formatted.append(line)
        return "\n".join(formatted)
    
    def _get_full_context(self, code: str) -> str:
        """Get the full classification path for a code"""
        if not code:
            return ""
            
        node = self.tree.code_index.get(code)
        if not node:
            return f"Code: {code}"
            
        path = node.full_context.copy()
        path.append(node.description)
        return " > ".join(path)
    
    def _create_prompt(self, product: str, current_code: str, options: List[Dict[str, Any]]) -> str:
        """Create a prompt for the current classification step"""
        # For first step (chapter selection)
        if not current_code:
            return f"""Classify this product into the most appropriate HS code chapter:

PRODUCT: {product}

OPTIONS:
{self._format_options(options)}

INSTRUCTIONS:
Select the single most appropriate option number from the list above.
Respond with ONLY the option number, for example "3".
"""
        
        # For subsequent steps
        current_path = self._get_full_context(current_code)
        
        return f"""Continue classifying this product:

PRODUCT: {product}

CURRENT CLASSIFICATION: {current_code} - {current_path}

NEXT LEVEL OPTIONS:
{self._format_options(options)}

INSTRUCTIONS:
Select the single most appropriate option number from the list above.
Respond with ONLY the option number, for example "3".

If none of the options are appropriate, respond with "FINAL: {current_code}".
"""
    
    def _call_openai(self, prompt: str, retries: int = 3) -> str:
        """Call OpenAI API with retries"""
        for attempt in range(retries):
            try:
                response = self.client.chat.completions.create(
                    model="o3-mini",  
                    messages=[
                        {"role": "system", "content": "You are a customs classification expert helping to assign HS codes."},
                        {"role": "user", "content": prompt}
                    ]
                )
                return response.choices[0].message.content.strip()
            except Exception as e:
                logger.warning(f"OpenAI API call failed (attempt {attempt+1}/{retries}): {e}")
                if attempt < retries - 1:
                    time.sleep(2)  # Wait before retrying
                else:
                    raise
    
    def _parse_response(self, response: str, options: List[Dict[str, Any]]) -> Tuple[str, bool]:
        """
        Parse the LLM response to get the selected option
        
        Returns:
            Tuple of (selected_code, is_final)
        """
        # Check if response indicates this is the final classification
        if response.startswith("FINAL:"):
            code = response.replace("FINAL:", "").strip()
            return code, True
        
        # Try to extract a number
        match = re.search(r'(\d+)', response)
        if match:
            option_num = int(match.group(1))
            # Check if it's a valid option number
            if 1 <= option_num <= len(options):
                return options[option_num - 1]["code"], False
        
        # If we can't parse a number, look for exact code match
        for option in options:
            if option["code"] in response:
                return option["code"], False
        
        # No valid option found
        logger.warning(f"Could not parse a valid option from response: {response}")
        return "", False
    
    def _log_step(self, step_num: int, current: str, selected: str, options: List[Dict[str, Any]], response: str) -> None:
        """Log a classification step"""
        logger.info(f"Step {step_num}: {current} → {selected}")
        
        # Store step details
        self.steps.append({
            "step": step_num,
            "current_code": current,
            "selected_code": selected,
            "options": options,
            "llm_response": response
        })
    
    def classify(self, product_description: str, max_steps: int = 10) -> Dict[str, Any]:
        """
        Classify a product to find its HS code
        
        Args:
            product_description: Description of the product to classify
            max_steps: Maximum number of classification steps to prevent infinite loops
            
        Returns:
            Classification result with code, path, and steps
        """
        logger.info(f"Starting classification for: {product_description}")
        
        # Reset tracking
        self.steps = []
        current_code = ""
        is_final = False
        step = 0
        
        # First, determine the chapter to filter the initial options
        chapter_code = self.determine_chapter(product_description)
        if not chapter_code:
            logger.warning("Could not determine chapter, using default approach")
        else:
            # Log first step
            options = [{
                "code": chapter_code,
                "description": self.chapters_map.get(int(chapter_code), "Unknown chapter")
            }]
            self._log_step(step, "", chapter_code, options, f"Selected chapter {chapter_code}")
            
            # Start with the chapter code
            current_code = chapter_code
            step = 1
        
        # Main classification loop
        while not is_final and step < max_steps:
            step += 1
            
            # Get options for current level
            options = self.get_children(current_code)
            
            # Log available options for debugging
            logger.info(f"Found {len(options)} options for code '{current_code}'")
            
            # If no options, we've reached a leaf node
            if not options:
                logger.info(f"No further options for {current_code}, ending classification")
                break
            
            # Create prompt for current step
            prompt = self._create_prompt(product_description, current_code, options)
            
            # Call OpenAI
            logger.info(f"Sending step {step} prompt to OpenAI")
            response = self._call_openai(prompt)
            
            # Parse response
            selected_code, is_final = self._parse_response(response, options)
            
            # Log step
            self._log_step(step, current_code, selected_code, options, response)
            
            # If no valid selection, end classification
            if not selected_code:
                logger.warning("No valid selection, ending classification")
                break
            
            # Update current code for next iteration
            current_code = selected_code
            
            # If no children, mark as final
            next_options = self.get_children(current_code)
            if not next_options:
                logger.info(f"No children for {current_code}, marking as final")
                is_final = True
        
        # Create final result
        result = {
            "product": product_description,
            "classification": current_code,
            "full_path": self._get_full_context(current_code),
            "steps": self.steps,
            "is_complete": is_final
        }
        
        logger.info(f"Final classification: {current_code} - {result['full_path']}")
        return result
    
    def explain_classification(self, result: Dict[str, Any]) -> str:
        """Generate an explanation of the classification process"""
        if not result or not result.get("steps"):
            return "No classification data available"
        
        product = result["product"]
        final_code = result["classification"]
        final_path = result["full_path"]
        
        prompt = f"""
        I need a detailed explanation for why this product was classified with this HS code:
        
        PRODUCT: {product}
        
        FINAL CLASSIFICATION: {final_code} - {final_path}
        
        CLASSIFICATION STEPS:
        """
        
        # Add each step to the prompt
        for step in result["steps"]:
            current = step["current_code"] or "Starting point"
            selected = step["selected_code"]
            
            # Add options context
            options_text = "\n".join([
                f"- {opt['code']}: {opt['description']}"
                for opt in step["options"][:5]  # Limit to first 5 to save space
            ])
            
            prompt += f"""
            Step {step['step']}: {current} → {selected}
            Available options included:
            {options_text}
            
            """
        
        prompt += """
        Provide a clear, step-by-step explanation of why this classification is correct.
        Explain each decision in the classification path, citing specific product features.
        """
        
        try:
            logger.info("Generating classification explanation")
            response = self.client.chat.completions.create(
                model="o3-mini",
                messages=[
                    {"role": "system", "content": "You are a customs classification expert."},
                    {"role": "user", "content": prompt}
                ]
            )
            explanation = response.choices[0].message.content
            logger.info("Explanation generated successfully")
            return explanation
        except Exception as e:
            logger.error(f"Failed to generate explanation: {e}")
            return "Could not generate explanation due to an error."


#########################################################
# COMMAND LINE INTERFACE
#########################################################

def main():
    """Main entry point for the script"""
    parser = argparse.ArgumentParser(description="HS Code Classifier")
    parser.add_argument("command", nargs="?", choices=["classify", "build"], 
                      help="Command to execute: 'classify' or 'build'")
    parser.add_argument("--tree", required=True, help="Path to the pickled HS code tree")
    parser.add_argument("--product", help="Product to classify")
    parser.add_argument("--file", help="JSON file with products to classify")
    parser.add_argument("--output", help="Output file for results")
    parser.add_argument("--explain", action="store_true", help="Generate explanations for classifications")
    parser.add_argument("--json", help="JSON file to build tree from (for build command)")
    
    args = parser.parse_args()
    
    # Default to classify if no command specified
    if not args.command:
        args.command = "classify"
    
    # Build tree
    if args.command == "build":
        if not args.json:
            print("Error: --json argument is required for build command")
            sys.exit(1)
        build_and_save_tree(args.json, args.output or "hs_code_tree.pkl")
        return
    
    # Classify product
    elif args.command == "classify":
        # Validate arguments
        if not args.product and not args.file:
            print("Error: Either --product or --file must be specified")
            sys.exit(1)
        
        # Initialize classifier with hardcoded API key
        try:
            classifier = HSCodeClassifier(args.tree, OPENAI_API_KEY)
        except Exception as e:
            print(f"Error initializing classifier: {e}")
            sys.exit(1)
        
        # Classify single product
        if args.product:
            result = classifier.classify(args.product)
            
            if args.explain:
                explanation = classifier.explain_classification(result)
                result["explanation"] = explanation
            
            # Print result
            print("\nClassification Result:")
            print(f"Product: {result['product']}")
            print(f"HS Code: {result['classification']}")
            print(f"Full Path: {result['full_path']}")
            print(f"Complete: {'Yes' if result['is_complete'] else 'No'}")
            
            if args.explain:
                print("\nExplanation:")
                print(result["explanation"])
            
            # Save to file if requested
            if args.output:
                with open(args.output, 'w') as f:
                    json.dump(result, f, indent=2)
                print(f"\nResults saved to {args.output}")
        
        # Classify multiple products from file
        elif args.file:
            try:
                with open(args.file, 'r') as f:
                    products = json.load(f)
                
                if not isinstance(products, list):
                    print("Error: Input file must contain a JSON array of product descriptions")
                    sys.exit(1)
                
                results = []
                for i, product in enumerate(products, 1):
                    print(f"\nClassifying product {i}/{len(products)}: {product}")
                    result = classifier.classify(product)
                    
                    if args.explain:
                        explanation = classifier.explain_classification(result)
                        result["explanation"] = explanation
                    
                    results.append(result)
                    
                    # Short delay to avoid rate limits
                    if i < len(products):
                        time.sleep(1)
                
                # Save results
                if args.output:
                    with open(args.output, 'w') as f:
                        json.dump(results, f, indent=2)
                    print(f"\nResults saved to {args.output}")
                else:
                    print("\nResults:")
                    for result in results:
                        print(f"Product: {result['product']}")
                        print(f"HS Code: {result['classification']}")
                        print(f"Full Path: {result['full_path']}")
                        print()
                        
            except Exception as e:
                print(f"Error processing file: {e}")
                sys.exit(1)


if __name__ == "__main__":
    main()
