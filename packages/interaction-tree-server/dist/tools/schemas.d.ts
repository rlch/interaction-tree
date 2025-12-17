/**
 * JSON Schema definitions for MCP tools.
 */
export declare const createSessionSchema: {
    type: "object";
    properties: {
        name: {
            type: string;
            description: string;
        };
        projectPath: {
            type: string;
            description: string;
        };
    };
    required: string[];
};
export declare const destroySessionSchema: {
    type: "object";
    properties: {
        session: {
            type: string;
            description: string;
        };
    };
    required: string[];
};
export declare const listSessionsSchema: {
    type: "object";
    properties: {};
};
export declare const connectSchema: {
    type: "object";
    properties: {
        session: {
            type: string;
            description: string;
        };
    };
    required: string[];
};
export declare const disconnectSchema: {
    type: "object";
    properties: {};
};
export declare const runSchema: {
    type: "object";
    properties: {
        device: {
            type: string;
            description: string;
        };
        flavor: {
            type: string;
            description: string;
        };
        target: {
            type: string;
            description: string;
        };
        dartDefines: {
            type: string;
            description: string;
        };
        additionalArgs: {
            type: string;
            items: {
                type: string;
            };
            description: string;
        };
    };
};
export declare const stopSchema: {
    type: "object";
    properties: {};
};
export declare const rebuildSchema: {
    type: "object";
    properties: {
        device: {
            type: string;
            description: string;
        };
        flavor: {
            type: string;
            description: string;
        };
        target: {
            type: string;
            description: string;
        };
        clean: {
            type: string;
            description: string;
        };
        dartDefines: {
            type: string;
            description: string;
        };
        additionalArgs: {
            type: string;
            items: {
                type: string;
            };
            description: string;
        };
    };
};
export declare const getStatusSchema: {
    type: "object";
    properties: {};
};
export declare const hotReloadSchema: {
    type: "object";
    properties: {};
};
export declare const hotRestartSchema: {
    type: "object";
    properties: {};
};
export declare const getLogsSchema: {
    type: "object";
    properties: {
        maxLines: {
            type: string;
            description: string;
        };
    };
};
export declare const getErrorsSchema: {
    type: "object";
    properties: {
        clear: {
            type: string;
            description: string;
        };
    };
};
export declare const getTreeSchema: {
    type: "object";
    properties: {
        includeBounds: {
            type: string;
            description: string;
        };
        includeWidgetType: {
            type: string;
            description: string;
        };
        includeState: {
            type: string;
            description: string;
        };
    };
};
export declare const targetIdSchema: {
    type: "object";
    properties: {
        id: {
            type: string;
            description: string;
        };
    };
    required: string[];
};
export declare const enterTextSchema: {
    type: "object";
    properties: {
        id: {
            type: string;
            description: string;
        };
        text: {
            type: string;
            description: string;
        };
    };
    required: string[];
};
export declare const scrollSchema: {
    type: "object";
    properties: {
        id: {
            type: string;
            description: string;
        };
        dx: {
            type: string;
            description: string;
        };
        dy: {
            type: string;
            description: string;
        };
    };
    required: string[];
};
export declare const scrollIntoViewSchema: {
    type: "object";
    properties: {
        id: {
            type: string;
            description: string;
        };
        alignment: {
            type: string;
            description: string;
        };
    };
    required: string[];
};
export declare const waitForSchema: {
    type: "object";
    properties: {
        id: {
            type: string;
            description: string;
        };
        condition: {
            type: string;
            enum: string[];
            description: string;
        };
        timeoutMs: {
            type: string;
            description: string;
        };
    };
    required: string[];
};
export declare const executeActionSchema: {
    type: "object";
    properties: {
        id: {
            type: string;
            description: string;
        };
        actionName: {
            type: string;
            description: string;
        };
        args: {
            type: string;
            description: string;
        };
    };
    required: string[];
};
export declare const batchSchema: {
    type: "object";
    properties: {
        steps: {
            type: string;
            description: string;
            items: {
                type: string;
                properties: {
                    action: {
                        type: string;
                        enum: string[];
                    };
                    id: {
                        type: string;
                    };
                    text: {
                        type: string;
                    };
                    dx: {
                        type: string;
                    };
                    dy: {
                        type: string;
                    };
                    alignment: {
                        type: string;
                    };
                    actionName: {
                        type: string;
                    };
                    args: {
                        type: string;
                    };
                    condition: {
                        type: string;
                    };
                    timeoutMs: {
                        type: string;
                    };
                    settle: {
                        type: string;
                    };
                };
                required: string[];
            };
        };
    };
    required: string[];
};
export declare const executeIntentSchema: {
    type: "object";
    properties: {
        intent: {
            type: string;
            description: string;
        };
        context: {
            type: string;
            items: {
                type: string;
            };
            description: string;
        };
        conversationId: {
            type: string;
            description: string;
        };
        answer: {
            type: string;
            description: string;
        };
    };
    required: string[];
};
//# sourceMappingURL=schemas.d.ts.map