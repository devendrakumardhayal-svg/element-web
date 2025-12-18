
import { logger } from "matrix-js-sdk/src/logger";

import type { IMatrixClientCreds } from "./MatrixClientPeg";
import type { OverwriteLoginPayload } from "./dispatcher/payloads/OverwriteLoginPayload";
import { Action } from "./dispatcher/actions";
import defaultDispatcher from "./dispatcher/dispatcher";

const TRUSTED_ORIGINS: string[] = ["*"];

export interface PostMessageAuthData {
    action: "element_auth";
    homeserverUrl: string;
    userId: string;
    accessToken: string;
    deviceId?: string;
    identityServerUrl?: string;
    refreshToken?: string;
    guest?: boolean;
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
        typeof authData.userId === "string" &&
        typeof authData.accessToken === "string"
    );
}

function isAllowedOrigin(origin: string): boolean {
    if (TRUSTED_ORIGINS.includes("*")) {
        return true;
    }
    return TRUSTED_ORIGINS.includes(origin);
}

function handleAuthMessage(event: MessageEvent): void {
    if (!isAllowedOrigin(event.origin)) {
        logger.debug("PostMessageAuth: Ignoring message from disallowed origin", event.origin);
        return;
    }

    if (!isValidAuthData(event.data)) {
        return;
    }

    const authData = event.data;
    logger.info("PostMessageAuth: Received valid auth data from", event.origin);

    const credentials: IMatrixClientCreds = {
        homeserverUrl: authData.homeserverUrl,
        userId: authData.userId,
        accessToken: authData.accessToken,
        deviceId: authData.deviceId,
        identityServerUrl: authData.identityServerUrl,
        refreshToken: authData.refreshToken,
        guest: authData.guest ?? false,
    };

    defaultDispatcher.dispatch<OverwriteLoginPayload>(
        {
            action: Action.OverwriteLogin,
            credentials,
        },
        true,
    );

    if (event.source && typeof event.source.postMessage === "function") {
        (event.source as WindowProxy).postMessage(
            {
                action: "element_auth_response",
                success: true,
            },
            event.origin,
        );
    }
}

export function startPostMessageAuthListener(): void {
    if (isListening) {
        return;
    }
    messageListener = handleAuthMessage;
    window.addEventListener("message", messageListener);
    isListening = true;
    logger.info("PostMessageAuth: Listener started for origins:", TRUSTED_ORIGINS);
}


export function stopPostMessageAuthListener(): void {
    if (!isListening || !messageListener) {
        return;
    }

    window.removeEventListener("message", messageListener);
    messageListener = null;
    isListening = false;
    logger.info("PostMessageAuth: Listener stopped");
}
