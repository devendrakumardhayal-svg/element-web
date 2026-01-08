/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";

const TRUSTED_ORIGINS: string[] = ["*"];

export interface PostMessageAuthData {
    action: "element_auth";
    homeserverUrl: string;
    accessToken: string;
    deviceId?: string;
}

type PostMessageAuthListener = (event: MessageEvent) => void;

let isListening = false;
let messageListener: PostMessageAuthListener | null = null;

function isValidAuthData(data: unknown): data is PostMessageAuthData {
    if (typeof data !== "object" || data === null) {
        return false;
    }
    const authData = data as Record<string, unknown>;
    return (
        authData.action === "element_auth" &&
        typeof authData.homeserverUrl === "string" &&
        typeof authData.accessToken === "string"
    );
}

function isAllowedOrigin(origin: string): boolean {
    if (TRUSTED_ORIGINS.includes("*")) {
        return true;
    }
    return TRUSTED_ORIGINS.includes(origin);
}

async function handleAuthMessage(event: MessageEvent): Promise<void> {
    logger.info("PostMessageAuth: Received message from", event.origin);

    if (!isAllowedOrigin(event.origin)) {
        logger.debug("PostMessageAuth: Ignoring message from disallowed origin", event.origin);
        return;
    }

    if (!isValidAuthData(event.data)) {
        logger.debug("PostMessageAuth: Invalid auth data, ignoring");
        return;
    }

    const authData = event.data;
    logger.info("PostMessageAuth: Valid auth data received, attempting login");

    try {
        if (typeof window.mxLoginWithAccessToken === "function") {
            await window.mxLoginWithAccessToken(authData.homeserverUrl, authData.accessToken);
            logger.info("PostMessageAuth: Login successful");
            sendResponse(event, true);
        } else {
            logger.error("PostMessageAuth: mxLoginWithAccessToken not available");
            sendResponse(event, false, "Login function not available");
        }
    } catch (e) {
        logger.error("PostMessageAuth: Login failed", e);
        sendResponse(event, false, e instanceof Error ? e.message : "Login failed");
    }
}

function sendResponse(event: MessageEvent, success: boolean, error?: string): void {
    if (event.source && typeof event.source.postMessage === "function") {
        (event.source as WindowProxy).postMessage(
            {
                action: "element_auth_response",
                success,
                error,
            },
            event.origin,
        );
    }
}

/**
 * Starts listening for postMessage authentication events.
 * Authentication data can be sent via postMessage from trusted origins defined in TRUSTED_ORIGINS.
 */
export function startPostMessageAuthListener(): void {
    if (isListening) {
        return;
    }
    messageListener = (event: MessageEvent): void => {
        handleAuthMessage(event).catch((e) => {
            logger.error("PostMessageAuth: Error handling message", e);
        });
    };
    window.addEventListener("message", messageListener);
    isListening = true;
    logger.info("PostMessageAuth: Listener started for origins:", TRUSTED_ORIGINS);
}

/**
 * Stops listening for postMessage authentication events.
 */
export function stopPostMessageAuthListener(): void {
    if (!isListening || !messageListener) {
        return;
    }
    window.removeEventListener("message", messageListener);
    messageListener = null;
    isListening = false;
    logger.info("PostMessageAuth: Listener stopped");
}
