/**
 * Image Generation Extension
 *
 * Implements a tool + command wrapper around Pi's image generation APIs
 * introduced in pi-coding-agent 0.74.x (inherited from @earendil-works/pi-ai).
 *
 * Docs reference: pi-ai README "Image Generation".
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

// pi-ai 0.74.1 ships image generation modules under dist/, but does not
// currently export them from the package entrypoint. We load them via file URL
// to avoid ERR_PACKAGE_PATH_NOT_EXPORTED.
async function loadPiAiImages(): Promise<{
	getImageModel: (provider: string, modelId: string) => any;
	generateImages: (model: any, context: any, options?: any) => Promise<any>;
}> {
	// Resolve package root from its entry file.
	const entry = await import.meta.resolve?.("@earendil-works/pi-ai");
	if (!entry) throw new Error("Unable to resolve @earendil-works/pi-ai");
	const entryPath = entry.startsWith("file://") ? new URL(entry).pathname : entry;
	const pkgRoot = path.resolve(entryPath, "..", "..");
	const imagesPath = path.join(pkgRoot, "dist", "images.js");
	const modelsPath = path.join(pkgRoot, "dist", "image-models.js");
	const imagesMod: any = await import(pathToFileURL(imagesPath).toString());
	const modelsMod: any = await import(pathToFileURL(modelsPath).toString());
	if (typeof modelsMod.getImageModel !== "function" || typeof imagesMod.generateImages !== "function") {
		throw new Error("pi-ai image generation API not found (version mismatch)");
	}
	return { getImageModel: modelsMod.getImageModel, generateImages: imagesMod.generateImages };
}

type ImageBlock = { type: "image"; mimeType: string; data: string };

type TextBlock = { type: "text"; text: string };

function env(name: string): string {
	return (process.env[name] ?? "").trim();
}

function requireApiKey(provider: "openrouter", apiKey: string): void {
	if (!apiKey) {
		throw new Error(
			`Missing API key for ${provider} image generation. Set OPENROUTER_API_KEY in your environment (recommended) or configure OpenRouter via /login so it is available in Pi's auth store.`,
		);
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "image_generate",
		label: "Image Generate",
		description:
			"Generate images using Pi's built-in image generation APIs (OpenRouter provider). " +
			"Returns base64 images as attachments in tool output.",
		promptSnippet: "Generate an image from a prompt (OpenRouter image models)",
		promptGuidelines: [
			"Use image_generate when the user asks to generate an image (text-to-image) or a variation (image-to-image).",
			"Prefer simple, explicit prompts; avoid including sensitive secrets.",
		],
		parameters: Type.Object({
			model: Type.String({
				description:
					"OpenRouter image model id (e.g. google/gemini-2.5-flash-image). Provider is always openrouter for now.",
				default: "google/gemini-2.5-flash-image",
			}),
			prompt: Type.String({ description: "Text prompt for the image" }),
			// optional input image (base64)
			inputImageBase64: Type.Optional(Type.String({ description: "Optional base64-encoded input image" })),
			inputImageMimeType: Type.Optional(Type.String({ description: "MIME type for input image (e.g. image/png)" })),
			count: Type.Optional(Type.Number({ description: "Number of images to generate (if supported)", default: 1 })),
			size: Type.Optional(
				Type.String({
					description: "Optional size hint (provider/model specific)",
				}),
			),
		}),

		async execute(_id, params, signal, _onUpdate, _ctx) {
			const apiKey = env("OPENROUTER_API_KEY");
			requireApiKey("openrouter", apiKey);

			const { getImageModel, generateImages } = await loadPiAiImages();
			const model = getImageModel("openrouter", params.model);
			const input: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
				{ type: "text", text: params.prompt },
			];

			if (params.inputImageBase64) {
				const mimeType = (params.inputImageMimeType ?? "image/png").trim() || "image/png";
				input.push({ type: "image", data: params.inputImageBase64, mimeType });
			}

			const result = await generateImages(
				model,
				{ input },
				{
					apiKey,
					signal,
					// Pass through any model-specific hints if present.
					// (OpenRouter accepts these depending on the model.)
					...(params.count ? { n: params.count } : {}),
					...(params.size ? { size: params.size } : {}),
				} as any,
			);

			const images: ImageBlock[] = [];
			const texts: string[] = [];

			for (const block of result.output as Array<ImageBlock | TextBlock>) {
				if (block.type === "text") texts.push(block.text);
				else if (block.type === "image") images.push(block);
			}

			const content: Array<any> = [];
			if (texts.length > 0) content.push({ type: "text", text: texts.join("\n\n") });
			for (const img of images) {
				content.push({
					type: "image",
					source: { type: "base64", mediaType: img.mimeType, data: img.data },
				});
			}

			if (content.length === 0) content.push({ type: "text", text: "(no output from image model)" });

			return {
				content,
				details: {
					provider: "openrouter",
					model: params.model,
					images: images.map((i) => ({ mimeType: i.mimeType, bytes: Math.floor((i.data.length * 3) / 4) })),
					textBlocks: texts.length,
					stopReason: (result as any).stopReason,
					usage: (result as any).usage,
					responseId: (result as any).responseId,
				},
			};
		},
	});

	pi.registerCommand("provider-doctor", {
		description: "Diagnostica autenticação/config do provider atual (e Together/OpenRouter)",
		handler: async (_args, ctx) => {
			const lines: string[] = [];
			const current = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "(no model selected)";
			lines.push(`Current model: ${current}`);

			if (ctx.model) {
				const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
				lines.push(`Current provider auth: ${auth.ok === false ? `ERROR: ${auth.error}` : auth.apiKey ? "OK (apiKey present)" : "MISSING"}`);
			}

			// Together
			try {
				const togetherProbe = ctx.modelRegistry.find("together", "togetherai/meta-llama/Llama-3.3-70B-Instruct-Turbo");
				if (togetherProbe) {
					const auth = await ctx.modelRegistry.getApiKeyAndHeaders(togetherProbe);
					lines.push(`Together auth: ${auth.ok === false ? `ERROR: ${auth.error}` : auth.apiKey ? "OK" : "MISSING"}`);
				} else {
					lines.push("Together models not found in registry (provider may be disabled or version mismatch). Try /login.");
				}
			} catch (e) {
				lines.push(`Together probe failed: ${(e as Error).message}`);
			}

			// OpenRouter (for image gen we primarily rely on OPENROUTER_API_KEY)
			lines.push(`OPENROUTER_API_KEY env: ${env("OPENROUTER_API_KEY") ? "set" : "missing"}`);

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
