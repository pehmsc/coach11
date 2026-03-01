import https from "node:https";
import { createRequire } from "node:module";
import { URL } from "node:url";
import type { PushSubscription } from "web-push";

type WebPushErrorInstance = Error & {
  statusCode?: number;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
  endpoint?: string;
};

type SendNotificationOptions = {
  TTL?: number;
  contentEncoding?: string;
  urgency?: string;
  timeout?: number;
};

type RequestDetails = {
  endpoint: string;
  method: "POST";
  headers: Record<string, string | number>;
  body: Buffer | null;
  timeout?: number;
};

type VapidDetails = {
  subject: string;
  publicKey: string;
  privateKey: string;
};

type WebPushLibClass = new (
  message: string,
  statusCode: number,
  headers: Record<string, string | string[] | undefined>,
  body: string,
  endpoint: string,
) => WebPushErrorInstance;

const require = createRequire(import.meta.url);

const vapidHelper = require("web-push/src/vapid-helper.js") as {
  validateSubject(subject: string): void;
  validatePublicKey(publicKey: string): void;
  validatePrivateKey(privateKey: string): void;
  getVapidHeaders(
    audience: string,
    subject: string,
    publicKey: string,
    privateKey: string,
    contentEncoding: string,
  ): {
    Authorization: string;
    "Crypto-Key"?: string;
  };
};

const encryptionHelper = require("web-push/src/encryption-helper.js") as {
  encrypt(
    userPublicKey: string,
    userAuth: string,
    payload: string | Buffer,
    contentEncoding: string,
  ): {
    localPublicKey: Buffer;
    salt: string;
    cipherText: Buffer;
  };
};

const WebPushError = require("web-push/src/web-push-error.js") as WebPushLibClass;
const webPushConstants = require("web-push/src/web-push-constants.js") as {
  supportedContentEncodings: {
    AES_GCM: string;
    AES_128_GCM: string;
  };
  supportedUrgency: {
    VERY_LOW: string;
    LOW: string;
    NORMAL: string;
    HIGH: string;
  };
};

const DEFAULT_TTL = 2419200;

let vapidDetails: VapidDetails | null = null;

export function setVapidDetails(
  subject: string | null,
  publicKey?: string,
  privateKey?: string,
) {
  if (subject === null) {
    vapidDetails = null;
    return;
  }

  if (!publicKey || !privateKey) {
    throw new Error("VAPID public/private key em falta.");
  }

  vapidHelper.validateSubject(subject);
  vapidHelper.validatePublicKey(publicKey);
  vapidHelper.validatePrivateKey(privateKey);

  vapidDetails = {
    subject,
    publicKey,
    privateKey,
  };
}

export function generateRequestDetails(
  subscription: PushSubscription,
  payload?: string | Buffer | null,
  options?: SendNotificationOptions,
): RequestDetails {
  if (!subscription?.endpoint || typeof subscription.endpoint !== "string") {
    throw new Error("A subscrição push tem de incluir um endpoint válido.");
  }

  if (payload) {
    if (
      typeof subscription !== "object" ||
      !subscription.keys?.p256dh ||
      !subscription.keys?.auth
    ) {
      throw new Error("A subscrição push não inclui auth/p256dh para enviar payload.");
    }
  }

  const contentEncoding =
    options?.contentEncoding === webPushConstants.supportedContentEncodings.AES_GCM
      ? webPushConstants.supportedContentEncodings.AES_GCM
      : webPushConstants.supportedContentEncodings.AES_128_GCM;

  const urgency =
    options?.urgency &&
    Object.values(webPushConstants.supportedUrgency).includes(options.urgency)
      ? options.urgency
      : webPushConstants.supportedUrgency.NORMAL;

  const timeToLive = Number(options?.TTL ?? DEFAULT_TTL);
  if (timeToLive < 0) {
    throw new Error("TTL inválido para Web Push.");
  }

  const requestDetails: RequestDetails = {
    endpoint: subscription.endpoint,
    method: "POST",
    headers: {
      TTL: timeToLive,
      Urgency: urgency,
    },
    body: null,
  };

  if (typeof options?.timeout === "number") {
    requestDetails.timeout = options.timeout;
  }

  if (payload) {
    const encrypted = encryptionHelper.encrypt(
      subscription.keys!.p256dh,
      subscription.keys!.auth,
      payload,
      contentEncoding,
    );

    requestDetails.headers["Content-Length"] = encrypted.cipherText.length;
    requestDetails.headers["Content-Type"] = "application/octet-stream";

    if (contentEncoding === webPushConstants.supportedContentEncodings.AES_128_GCM) {
      requestDetails.headers["Content-Encoding"] =
        webPushConstants.supportedContentEncodings.AES_128_GCM;
    } else {
      requestDetails.headers["Content-Encoding"] =
        webPushConstants.supportedContentEncodings.AES_GCM;
      requestDetails.headers.Encryption = `salt=${encrypted.salt}`;
      requestDetails.headers["Crypto-Key"] = `dh=${encrypted.localPublicKey.toString("base64url")}`;
    }

    requestDetails.body = encrypted.cipherText;
  } else {
    requestDetails.headers["Content-Length"] = 0;
  }

  if (vapidDetails) {
    const endpointUrl = new URL(subscription.endpoint);
    const vapidHeaders = vapidHelper.getVapidHeaders(
      endpointUrl.origin,
      vapidDetails.subject,
      vapidDetails.publicKey,
      vapidDetails.privateKey,
      contentEncoding,
    );

    requestDetails.headers.Authorization = vapidHeaders.Authorization;
    if (
      contentEncoding === webPushConstants.supportedContentEncodings.AES_GCM &&
      vapidHeaders["Crypto-Key"]
    ) {
      requestDetails.headers["Crypto-Key"] = requestDetails.headers["Crypto-Key"]
        ? `${requestDetails.headers["Crypto-Key"]};${vapidHeaders["Crypto-Key"]}`
        : vapidHeaders["Crypto-Key"];
    }
  }

  return requestDetails;
}

export function sendNotification(
  subscription: PushSubscription,
  payload?: string | Buffer | null,
  options?: SendNotificationOptions,
) {
  const requestDetails = generateRequestDetails(subscription, payload, options);
  const endpointUrl = new URL(requestDetails.endpoint);

  return new Promise<{
    statusCode: number;
    body: string;
    headers: Record<string, string | string[] | undefined>;
  }>((resolve, reject) => {
    const pushRequest = https.request(
      {
        protocol: endpointUrl.protocol,
        hostname: endpointUrl.hostname,
        port: endpointUrl.port ? Number(endpointUrl.port) : undefined,
        path: `${endpointUrl.pathname}${endpointUrl.search}`,
        method: requestDetails.method,
        headers: requestDetails.headers,
        timeout: requestDetails.timeout,
      },
      (pushResponse) => {
        let responseText = "";

        pushResponse.on("data", (chunk) => {
          responseText += chunk;
        });

        pushResponse.on("end", () => {
          if (!pushResponse.statusCode || pushResponse.statusCode < 200 || pushResponse.statusCode > 299) {
            reject(
              new WebPushError(
                "Received unexpected response code",
                pushResponse.statusCode || 500,
                pushResponse.headers,
                responseText,
                requestDetails.endpoint,
              ),
            );
            return;
          }

          resolve({
            statusCode: pushResponse.statusCode,
            body: responseText,
            headers: pushResponse.headers,
          });
        });
      },
    );

    if (requestDetails.timeout) {
      pushRequest.on("timeout", () => {
        pushRequest.destroy(new Error("Socket timeout"));
      });
    }

    pushRequest.on("error", (error) => {
      reject(error);
    });

    if (requestDetails.body) {
      pushRequest.write(requestDetails.body);
    }

    pushRequest.end();
  });
}
