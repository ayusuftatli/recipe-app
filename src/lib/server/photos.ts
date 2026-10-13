import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import { uuid } from '$lib/uuid';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function photoDir(): string {
	return env.PHOTO_DIR || './data/photos';
}

/** photo_path stores the base name; files are "<name>.webp" and "<name>.thumb.webp". */
const NAME_RE = /^[0-9a-f-]{36}$/;

export function isPhotoName(name: string): boolean {
	return NAME_RE.test(name);
}

export async function savePhoto(input: Buffer): Promise<string> {
	const name = uuid();
	const dir = photoDir();
	await mkdir(dir, { recursive: true });
	// .rotate() applies EXIF orientation (phone photos) before resizing.
	const base = sharp(input, { failOn: 'error' }).rotate();
	const [full, thumb] = await Promise.all([
		base.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
		base.clone().resize({ width: 400, height: 400, fit: 'cover' }).webp({ quality: 75 }).toBuffer()
	]);
	await Promise.all([writeFile(join(dir, `${name}.webp`), full), writeFile(join(dir, `${name}.thumb.webp`), thumb)]);
	return name;
}

export async function readPhoto(name: string, size: 'full' | 'thumb'): Promise<Buffer | null> {
	if (!isPhotoName(name)) return null;
	try {
		return await readFile(join(photoDir(), size === 'thumb' ? `${name}.thumb.webp` : `${name}.webp`));
	} catch {
		return null;
	}
}

export function photoExists(name: string): boolean {
	return isPhotoName(name) && existsSync(join(photoDir(), `${name}.webp`));
}

export async function deletePhoto(name: string | null): Promise<void> {
	if (!name || !isPhotoName(name)) return;
	const dir = photoDir();
	await Promise.all([`${name}.webp`, `${name}.thumb.webp`].map((f) => unlink(join(dir, f)).catch(() => {})));
}

/** Downscaled JPEG data: URL for sending a photo to a vision model. */
export async function photoToDataUrl(input: Buffer): Promise<string> {
	const jpeg = await sharp(input, { failOn: 'error' })
		.rotate()
		.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();
	return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}
