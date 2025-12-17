/**
 * Types for the interaction tree data structures.
 * Mirrors the Dart types from interaction_tree package.
 */

export interface InteractionTarget {
  id: string;
  description?: string;
  capabilities: InteractionCapability[];
  actions?: InteractionAction[];
  children?: InteractionTarget[];

  // Optional fields based on get_tree options
  bounds?: TargetBounds;
  widgetType?: string;
  state?: TargetState;
}

export interface InteractionCapability {
  type: 'tap' | 'doubleTap' | 'longPress' | 'enterText' | 'scroll' | 'drag';
}

export interface InteractionAction {
  name: string;
  description?: string;
  parameters?: ActionParameter[];
}

export interface ActionParameter {
  name: string;
  type: 'string' | 'int' | 'double' | 'bool';
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
}

export interface TargetBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TargetState {
  text?: string;
  enabled?: boolean;
  visible?: boolean;
  focused?: boolean;
}

export interface InteractionResult {
  success: boolean;
  error?: string;
  duration_ms?: number;
}

export interface BatchStep {
  action:
    | 'tap'
    | 'doubleTap'
    | 'longPress'
    | 'enterText'
    | 'clearText'
    | 'drag'
    | 'scroll'
    | 'scrollIntoView'
    | 'waitFor'
    | 'executeAction';
  id: string;
  text?: string;
  dx?: number;
  dy?: number;
  alignment?: number;
  actionName?: string;
  args?: Record<string, unknown>;
  condition?: 'exists' | 'notExists' | 'visible' | 'notVisible';
  timeoutMs?: number;
  settle?: boolean;
}

export interface BatchResult {
  success: boolean;
  results: InteractionResult[];
  stoppedAtIndex?: number;
  error?: string;
}

export interface GetTreeOptions {
  includeBounds?: boolean;
  includeWidgetType?: boolean;
  includeState?: boolean;
}
