import { useState, useCallback, useRef } from 'react';

// Event types from the streaming API
export interface StreamEvent {
  type: string;
  timestamp: string;
  data: any;
}

export interface BeamPath {
  position: number;
  path_id: string;
  chapter: string;
  current_path: string;
  log_score: number;
  cumulative_confidence: number;
  is_active: boolean;
  is_complete: boolean;
}

export interface ClassificationDecision {
  code: string;
  description: string;
  confidence: number;
  level: number;
  timestamp: string;
  competitors?: {
    code: string;
    description: string;
    confidence: number;
  }[];
}

export interface StreamingState {
  isStreaming: boolean;
  events: StreamEvent[];
  currentStage: string;
  currentBeam: BeamPath[];
  finalResult: any | null;
  error: string | null;
  progress: number;
  elapsedTime: number;
  currentQuestion: any | null;
  isWaitingForAnswer: boolean;
  classificationState: any | null; // Store the full classification state for answer submission
  classificationDecisions: ClassificationDecision[]; // Track firm classification decisions
  enrichedDescription: string | null; // Store the latest enriched product description
  currentModel: 'vertex' | 'groq'; // Track which model is being used
}

export const useClassificationStream = () => {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    events: [],
    currentStage: 'idle',
    currentBeam: [],
    finalResult: null,
    error: null,
    progress: 0,
    elapsedTime: 0,
    currentQuestion: null,
    isWaitingForAnswer: false,
    classificationState: null,
    classificationDecisions: [],
    enrichedDescription: null,
    currentModel: 'vertex'
  });

  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  // Update elapsed time
  const updateElapsedTime = useCallback(() => {
    if (startTimeRef.current > 0) {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setState(prev => ({ ...prev, elapsedTime: elapsed }));
    }
  }, []);

  // Start the timer for elapsed time
  const startTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(updateElapsedTime, 1000);
  }, [updateElapsedTime]);

  // Stop the timer
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Parse streaming event and update state
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    setState(prev => {
      const newEvents = [...prev.events, event];
      let newStage = prev.currentStage;
      let newBeam = prev.currentBeam;
      let newProgress = prev.progress;
      let finalResult = prev.finalResult;
      let newDecisions = [...prev.classificationDecisions];

      // Update stage based on event type
      switch (event.type) {
        case 'classification_start':
          newStage = 'Starting classification...';
          newProgress = 5;
          break;
        
        case 'initialization_start':
          newStage = 'Determining top chapters...';
          newProgress = 15;
          break;
        
        case 'chapter_selection':
          if (event.data.chapters && event.data.chapters.length > 0) {
            const topChapter = event.data.chapters[0];
            newStage = `Selected Chapter ${topChapter.chapter}: ${topChapter.description}`;
            
            // Add chapter selection as a firm decision (no competitors for chapter level)
            newDecisions.push({
              code: topChapter.chapter,
              description: topChapter.description,
              confidence: topChapter.confidence || 0,
              level: 0,
              timestamp: event.timestamp
            });
          } else {
            newStage = 'Chapter selection complete';
          }
          newProgress = 25;
          break;
        
        case 'path_initialized':
          if (event.data.chapter) {
            newStage = `Initialized path for Chapter ${event.data.chapter}`;
          } else {
            newStage = 'Path initialized';
          }
          newProgress = 35;
          break;
        
        case 'iteration_start':
          newStage = `Iteration ${event.data.iteration} - Exploring ${event.data.beam_size} paths`;
          newProgress = Math.min(40 + (event.data.iteration * 10), 80);
          break;
        
        case 'candidate_scoring_start':
          newStage = `Evaluating ${event.data.options_count} options for ${event.data.current_node}`;
          break;
        
        case 'candidate_scoring_complete':
          if (event.data.best_confidence) {
            newStage = `Best match found with ${Math.round(event.data.best_confidence * 100)}% confidence`;
            
            // Check if this represents a firm decision (high confidence threshold)
            if (event.data.best_confidence > 0.8 && event.data.selected_code && event.data.current_node) {
              // Extract level from the code length (rough approximation)
              const codeLength = event.data.selected_code.length;
              let level = 0;
              if (codeLength >= 4) level = 1; // Heading level
              if (codeLength >= 6) level = 2; // Subheading level
              if (codeLength >= 8) level = 3; // Further subdivision
              
              // Only add if it's a new decision (not already tracked)
              const alreadyExists = newDecisions.some(d => d.code === event.data.selected_code);
              if (!alreadyExists) {
                newDecisions.push({
                  code: event.data.selected_code,
                  description: event.data.selected_description || `Classification ${event.data.selected_code}`,
                  confidence: event.data.best_confidence,
                  level,
                  timestamp: event.timestamp,
                  competitors: event.data.alternatives?.slice(0, 3).map((alt: any) => ({
                    code: alt.code || alt.hs_code,
                    description: alt.description,
                    confidence: alt.confidence || 0
                  })) || []
                });
              }
            }
          }
          break;
        
        case 'beam_leaderboard':
          // Handle both capitalized and lowercase field names
          let beamData = event.data.Beam || event.data.beam || [];
          
          // Convert capitalized field names to lowercase for consistency
          const previousBeam = newBeam;
          newBeam = beamData.map((item: any) => ({
            position: item.Position || item.position,
            path_id: item['Path Id'] || item.path_id,
            chapter: item.Chapter || item.chapter,
            current_path: item['Current Path'] || item.current_path,
            log_score: item['Log Score'] || item.log_score,
            cumulative_confidence: item['Cumulative Confidence'] || item.cumulative_confidence,
            is_active: item['Is Active'] || item.is_active,
            is_complete: item['Is Complete'] || item.is_complete
          }));
          
          // Track decisions from the top path only
          if (newBeam.length > 0) {
            const topPath = newBeam[0];
            const segments = topPath.current_path.split(' > ');
            const topPathCodes = [];
            
            // Extract HS codes from the top path, ensuring proper hierarchy
            for (const segment of segments) {
              // Skip [GROUP] segments
              if (segment.includes('[GROUP]')) {
                continue;
              }
              
              // Extract the HS code from the beginning of the segment (including all decimal formats)
              const codeMatch = segment.match(/^(\d{2,}(?:\.\d{1,})*)/);
              
              if (codeMatch) {
                const code = codeMatch[1];
                
                // Only add if this code represents a new level in the hierarchy
                // Check if we already have this exact code
                const alreadyExists = topPathCodes.some(existing => existing.code === code);
                
                if (!alreadyExists) {
                  topPathCodes.push({
                    code: code,
                    segment: segment
                  });
                }
              }
            }
            
            // For each code in the top path, check if we need to add or update decisions
            topPathCodes.forEach((pathCode, level) => {
              const existingDecision = newDecisions.find(d => d.level === level);
              
              if (!existingDecision) {
                // Add new decision for this level
                // Extract description - everything after the code and separator
                let description = '';
                const patterns = [
                  new RegExp(`^${pathCode.code}\\s*-\\s*(.+)`),
                  new RegExp(`^${pathCode.code}\\.\\s*(.+)`),
                  new RegExp(`^${pathCode.code}\\s+(.+)`)
                ];
                
                for (const pattern of patterns) {
                  const match = pathCode.segment.match(pattern);
                  if (match) {
                    description = match[1].replace(/<\/?[^>]+(>|$)/g, "").trim();
                    break;
                  }
                }
                
                newDecisions.push({
                  code: pathCode.code,
                  description: description || `Classification ${pathCode.code}`,
                  confidence: topPath.cumulative_confidence,
                  level,
                  timestamp: event.timestamp
                });
              } else if (existingDecision.code !== pathCode.code) {
                // Update existing decision if the top path changed
                let description = '';
                const patterns = [
                  new RegExp(`^${pathCode.code}\\s*-\\s*(.+)`),
                  new RegExp(`^${pathCode.code}\\.\\s*(.+)`),
                  new RegExp(`^${pathCode.code}\\s+(.+)`)
                ];
                
                for (const pattern of patterns) {
                  const match = pathCode.segment.match(pattern);
                  if (match) {
                    description = match[1].replace(/<\/?[^>]+(>|$)/g, "").trim();
                    break;
                  }
                }
                
                // Update the existing decision
                existingDecision.code = pathCode.code;
                existingDecision.description = description || `Classification ${pathCode.code}`;
                existingDecision.confidence = topPath.cumulative_confidence;
                existingDecision.timestamp = event.timestamp;
              }
            });
            
            // Remove any decisions beyond the current path depth to avoid duplicates
            newDecisions = newDecisions.filter(d => d.level < topPathCodes.length);
          }
          
          if (newBeam.length > 0) {
            const topPath = newBeam[0];
            const confidence = Math.round((topPath.cumulative_confidence || 0) * 100);
            newStage = `Leading path: ${confidence}% confidence - ${newBeam.length} paths active`;
          } else {
            newStage = `Analyzing classification paths`;
          }
          newProgress = Math.min(newProgress + 5, 85);
          break;
        
        case 'question_generated':
          newStage = 'Clarification needed';
          newProgress = 90;
          
          // Extract enriched description from the classification state
          let enrichedFromState = prev.enrichedDescription;
          const state = event.data.state || event.data.classification_state;
          if (state) {
            // Look for enriched description in various state fields
            if (state.enriched_query) {
              enrichedFromState = state.enriched_query;
            } else if (state.enriched_description) {
              enrichedFromState = state.enriched_description;
            } else if (state.product_description) {
              enrichedFromState = state.product_description;
            } else if (state.current_query) {
              enrichedFromState = state.current_query;
            }
          }
          
          console.log('[Question Generated] State:', state);
          console.log('[Question Generated] Enriched description from state:', enrichedFromState);
          console.log('[Question Generated] Current isStreaming:', prev.isStreaming);
          
          // Store the question and classification state, then pause streaming
          return {
            ...prev,
            events: newEvents,
            currentStage: newStage,
            currentBeam: newBeam,
            progress: newProgress,
            finalResult,
            currentQuestion: event.data,
            isWaitingForAnswer: true,
            classificationState: state,
            enrichedDescription: enrichedFromState,
            isStreaming: prev.isStreaming // Explicitly preserve isStreaming
          };
        
        case 'continuation_start':
          newStage = 'Processing your answer...';
          newProgress = 92;
          // Clear the waiting state as we're now continuing
          return {
            ...prev,
            events: newEvents,
            currentStage: newStage,
            currentBeam: newBeam,
            progress: newProgress,
            finalResult,
            isWaitingForAnswer: false,
            currentQuestion: null,
            isStreaming: prev.isStreaming // Explicitly preserve isStreaming
          };
        
        case 'answer_processing':
          newStage = 'Enriching product description...';
          newProgress = 94;
          break;
        
        case 'classification_complete':
          newStage = 'Classification complete!';
          newProgress = 100;
          finalResult = event.data;
          // Immediately stop streaming when classification is complete
          return {
            ...prev,
            events: newEvents,
            currentStage: newStage,
            currentBeam: newBeam,
            progress: newProgress,
            finalResult,
            isStreaming: false
          };
      }

      return {
        ...prev,
        events: newEvents,
        currentStage: newStage,
        currentBeam: newBeam,
        progress: newProgress,
        finalResult,
        classificationDecisions: newDecisions
      };
    });
  }, []);

  // Start streaming classification
  const startStreaming = useCallback(async (product: string, options: any = {}) => {
    try {
      // Determine the endpoint based on the selected model
      const model = options.model || 'vertex'; // Default to vertex for backward compatibility
      const endpoint = model === 'groq' ? '/classify-groq/stream' : '/classify/stream';

      setState(prev => ({
        ...prev,
        isStreaming: true,
        events: [],
        currentBeam: [],
        finalResult: null,
        error: null,
        progress: 0,
        elapsedTime: 0,
        currentStage: 'Connecting...',
        classificationDecisions: [],
        currentQuestion: null,
        isWaitingForAnswer: false,
        classificationState: null,
        enrichedDescription: null,
        currentModel: model
      }));

      startTimer();

      const response = await fetch(`https://hscode-eight.vercel.app${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product,
          interactive: options.interactive ?? true,
          max_questions: options.maxQuestions ?? 3,
          use_multi_hypothesis: true,
          hypothesis_count: options.hypothesisCount ?? 3
        })
      });

      if (!response.ok) {
        throw new Error(`Stream failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body available');
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Add new chunk to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete events from buffer
        let eventEndIndex;
        while ((eventEndIndex = buffer.indexOf('\n\n')) !== -1) {
          const eventText = buffer.substring(0, eventEndIndex);
          buffer = buffer.substring(eventEndIndex + 2);
          
          // Parse the complete event
          const lines = eventText.split('\n');
          let dataLines = [];
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              dataLines.push(line.substring(6)); // Remove 'data: ' prefix
            }
          }
          
          if (dataLines.length > 0) {
            try {
              // Join all data lines to form complete JSON
              const jsonData = dataLines.join('');
              const eventData = JSON.parse(jsonData);
              
              // Create stream event from the parsed SSE data
              const streamEvent: StreamEvent = {
                type: eventData.type || 'unknown',
                timestamp: eventData.timestamp || new Date().toISOString(),
                data: eventData.data || {}
              };

              handleStreamEvent(streamEvent);
            } catch (parseError) {
              console.warn('Failed to parse SSE event:', dataLines.join(''), parseError);
            }
          }
        }
      }

      setState(prev => ({ ...prev, isStreaming: false }));
      stopTimer();

    } catch (error) {
      console.error('Streaming error:', error);
      setState(prev => ({
        ...prev,
        isStreaming: false,
        error: error instanceof Error ? error.message : 'Unknown streaming error'
      }));
      stopTimer();
    }
  }, [handleStreamEvent, startTimer, stopTimer]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.cancel();
      readerRef.current = null;
    }
    setState(prev => ({ ...prev, isStreaming: false }));
    stopTimer();
  }, [stopTimer]);

  // Stop streaming gracefully (when we have a final result)
  const stopStreamingGracefully = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.cancel();
      readerRef.current = null;
    }
    // Only set isStreaming to false, preserve all other state including finalResult
    setState(prev => ({ ...prev, isStreaming: false }));
    stopTimer();
  }, [stopTimer]);

  // Answer a question and continue streaming
  const answerQuestion = useCallback(async (answer: string) => {
    if (!state.currentQuestion || !state.isWaitingForAnswer) {
      console.warn('No question to answer');
      return;
    }

    try {
      // Clear the question state
      setState(prev => ({
        ...prev,
        currentQuestion: null,
        isWaitingForAnswer: false,
        currentStage: 'Resuming classification...'
      }));

      // Determine the correct continue endpoint based on the current model
      const continueEndpoint = state.currentModel === 'groq' ? '/classify-groq/continue/stream' : '/classify/continue/stream';

      // Log the state being sent to the API
      const requestBody = {
        state: state.classificationState || {},
        answer: answer
      };
      console.log('[Answer Question] Sending state to continue endpoint:', JSON.stringify(requestBody, null, 2));

      // Send the answer to the API with the correct structure
      const response = await fetch(`https://hscode-eight.vercel.app${continueEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Answer submission failed: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body available for continuation');
      }

      // Read the continuation stream - this is the critical missing piece!
      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Add new chunk to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete events from buffer
        let eventEndIndex;
        while ((eventEndIndex = buffer.indexOf('\n\n')) !== -1) {
          const eventText = buffer.substring(0, eventEndIndex);
          buffer = buffer.substring(eventEndIndex + 2);
          
          // Parse the complete event
          const lines = eventText.split('\n');
          let dataLines = [];
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              dataLines.push(line.substring(6)); // Remove 'data: ' prefix
            }
          }
          
          if (dataLines.length > 0) {
            try {
              // Join all data lines to form complete JSON
              const jsonData = dataLines.join('');
              const eventData = JSON.parse(jsonData);
              
              // Create stream event from the parsed SSE data
              const streamEvent: StreamEvent = {
                type: eventData.type || 'unknown',
                timestamp: eventData.timestamp || new Date().toISOString(),
                data: eventData.data || {}
              };

              handleStreamEvent(streamEvent);
            } catch (parseError) {
              console.warn('Failed to parse continuation SSE event:', dataLines.join(''), parseError);
            }
          }
        }
      }

      setState(prev => ({ ...prev, isStreaming: false }));

    } catch (error) {
      console.error('Error answering question:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to answer question',
        isStreaming: false
      }));
    }
  }, [state.currentQuestion, state.isWaitingForAnswer, state.classificationState, state.currentModel, handleStreamEvent]);

  // Reset state
  const reset = useCallback(() => {
    stopStreaming();
    setState({
      isStreaming: false,
      events: [],
      currentStage: 'idle',
      currentBeam: [],
      finalResult: null,
      error: null,
      progress: 0,
      elapsedTime: 0,
      currentQuestion: null,
      isWaitingForAnswer: false,
      classificationState: null,
      classificationDecisions: [],
      enrichedDescription: null,
      currentModel: 'vertex'
    });
  }, [stopStreaming]);

  // Restart streaming with a forced path
  const restartStreaming = useCallback(async (
    product: string, 
    forcedPath: Array<{ code: string; description: string }>,
    options: any = {}
  ) => {
    console.log('[restartStreaming] Starting restart with forced path:', forcedPath);
    
    // Build a modified product description that includes the forced path
    let modifiedProduct = product;
    if (forcedPath.length > 0) {
      // Get the last code in the forced path (the one we want to continue from)
      const lastPathItem = forcedPath[forcedPath.length - 1];
      
      // Use system override language to force the classification
      modifiedProduct = `SYSTEM OVERRIDE: Force classification path to ${lastPathItem.code} - ${lastPathItem.description}. Product: ${product}. Begin classification from code ${lastPathItem.code} and find the most appropriate subclassification.`;
    }
    
    console.log('[restartStreaming] Modified product description:', modifiedProduct);
    
    // First reset the state completely
    reset();
    
    // Wait a moment for the reset to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Now use the regular startStreaming function with the modified product
    console.log('[restartStreaming] Calling startStreaming with modified product');
    return startStreaming(modifiedProduct, options);
  }, [reset, startStreaming]);

  // Continue classification from a specific point with reconstructed state
  const continueFromState = useCallback(async (
    reconstructedState: any,
    options: any = {}
  ) => {
    console.log('[continueFromState] Starting continuation with reconstructed state:', reconstructedState);
    
    try {
      // Determine the endpoint based on the selected model
      const model = options.model || state.currentModel || 'vertex';
      const continueEndpoint = model === 'groq' ? '/classify-groq/continue/stream' : '/classify/continue/stream';

      // Set the state to show we're continuing
      setState(prev => ({
        ...prev,
        isStreaming: true,
        error: null,
        currentStage: 'Continuing classification...',
        currentModel: model
      }));

      startTimer();

      // Send the reconstructed state to the continue endpoint
      const response = await fetch(`https://hscode-eight.vercel.app${continueEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state: reconstructedState,
          answer: null // No answer needed, just continuing from state
        })
      });

      if (!response.ok) {
        throw new Error(`Continue failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body available');
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Add new chunk to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete events from buffer
        let eventEndIndex;
        while ((eventEndIndex = buffer.indexOf('\n\n')) !== -1) {
          const eventText = buffer.substring(0, eventEndIndex);
          buffer = buffer.substring(eventEndIndex + 2);
          
          // Parse the complete event
          const lines = eventText.split('\n');
          let dataLines = [];
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              dataLines.push(line.substring(6)); // Remove 'data: ' prefix
            }
          }
          
          if (dataLines.length > 0) {
            try {
              // Join all data lines to form complete JSON
              const jsonData = dataLines.join('');
              const eventData = JSON.parse(jsonData);
              
              // Create stream event from the parsed SSE data
              const streamEvent: StreamEvent = {
                type: eventData.type || 'unknown',
                timestamp: eventData.timestamp || new Date().toISOString(),
                data: eventData.data || {}
              };

              handleStreamEvent(streamEvent);
            } catch (parseError) {
              console.warn('Failed to parse SSE event:', dataLines.join(''), parseError);
            }
          }
        }
      }

      setState(prev => ({ ...prev, isStreaming: false }));
      stopTimer();

    } catch (error) {
      console.error('Continue from state error:', error);
      setState(prev => ({
        ...prev,
        isStreaming: false,
        error: error instanceof Error ? error.message : 'Unknown continuation error'
      }));
      stopTimer();
    }
  }, [state.currentModel, handleStreamEvent, startTimer, stopTimer]);

  // Reconstruct state for continuing from a specific classification point
  const reconstructStateForContinuation = useCallback((
    currentState: any,
    changeLevel: number, // 0=chapter, 1=heading, 2=subheading, 3=tariff
    newNode: { node_id?: number, code: string, description: string, is_group?: boolean }
  ) => {
    console.log('[reconstructStateForContinuation] Input:', { currentState, changeLevel, newNode });
    
    // Extract steps up to the change point
    const stepsToKeep = currentState.steps ? currentState.steps.slice(0, changeLevel) : [];
    
    // Build new selection object
    const newSelection: any = {};
    const levelKeys = ['chapter', 'heading', 'subheading', 'tariff'];
    
    // Copy selections up to the change level
    for (let i = 0; i < changeLevel; i++) {
      const key = levelKeys[i];
      if (currentState.selection && currentState.selection[key]) {
        newSelection[key] = currentState.selection[key];
      }
    }
    
    // Set the new selection at the change level
    if (changeLevel === 0) {
      newSelection.chapter = newNode.code;
    } else if (newNode.node_id) {
      newSelection[levelKeys[changeLevel]] = newNode.node_id;
    }
    
    // Build classification path up to the new selection
    const classificationPathToKeep = currentState.classification_path 
      ? currentState.classification_path.slice(0, changeLevel) 
      : [];
    
    const newClassificationPath = [
      ...classificationPathToKeep,
      {
        type: levelKeys[changeLevel],
        code: newNode.code,
        description: newNode.description,
        is_group: newNode.is_group || false,
        node_id: newNode.node_id,
        confidence: 1.0, // User selected, so max confidence
        cumulative_confidence: 1.0
      }
    ];
    
    // Determine the next stage
    const nextStage = changeLevel < 3 ? levelKeys[changeLevel + 1] : 'complete';
    
    // Build visited nodes list
    const visitedNodes = currentState.visited_nodes ? [...currentState.visited_nodes] : [];
    if (newNode.node_id && !visitedNodes.includes(newNode.node_id)) {
      visitedNodes.push(newNode.node_id);
    }
    
    // Construct the state for continuation
    const reconstructedState = {
      product: currentState.product || currentState.original_query,
      original_query: currentState.original_query || currentState.product,
      current_query: currentState.current_query || currentState.product,
      questions_asked: 0, // Reset questions
      selection: newSelection,
      current_node: newNode.node_id || null,
      classification_path: newClassificationPath,
      steps: stepsToKeep,
      conversation: [], // Clear conversation
      pending_question: null, // Clear any pending question
      pending_stage: nextStage,
      max_questions: currentState.max_questions || 3,
      visited_nodes: visitedNodes,
      history: currentState.history || [],
      product_attributes: currentState.product_attributes || {},
      recent_questions: [],
      global_retry_count: 0,
      classification_diagnosis: null,
      use_multi_hypothesis: currentState.use_multi_hypothesis !== undefined ? currentState.use_multi_hypothesis : true,
      hypothesis_count: currentState.hypothesis_count || 3,
      paths: [], // Will be rebuilt by the API
      beam: [], // Will be rebuilt by the API
      streaming: true,
      iteration_count: 0
    };
    
    console.log('[reconstructStateForContinuation] Output:', reconstructedState);
    return reconstructedState;
  }, []);

  return {
    ...state,
    startStreaming,
    stopStreaming,
    stopStreamingGracefully,
    answerQuestion,
    reset,
    restartStreaming,
    continueFromState,
    reconstructStateForContinuation
  };
};
