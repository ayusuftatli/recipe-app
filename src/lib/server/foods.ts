import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { foods } from './db/schema';
import { normalizeName } from '$lib/food-sources';
import { Nutrients } from '$lib/schema';
import type { Food } from '$lib/types';
import { uuid } from '$lib/uuid';

type FoodRow = typeof foods.$inferSelect;

function toFood(r: FoodRow): Food {
	return { id: r.id, name: r.name, source: r.source, source_id: r.sourceId, nutrients: Nutrients.parse(JSON.parse(r.nutrientsPer100g)) };
}

export function getFoods(ids: string[]): Record<string, Food> {
	const unique = [...new Set(ids)];
	if (unique.length === 0) return {};
	const rows = db.select().from(foods).where(inArray(foods.id, unique)).all();
	return Object.fromEntries(rows.map((r) => [r.id, toFood(r)]));
}

/**
 * Stores a food and returns its id. Database foods are cached by
 * (source, source_id), so the same entry is only ever stored once; foods
 * typed in by hand always get a new row.
 */
export function saveFood(food: Omit<Food, 'id'>): string {
	if (food.source !== 'manual' && food.source_id) {
		const existing = db
			.select({ id: foods.id })
			.from(foods)
			.where(and(eq(foods.source, food.source), eq(foods.sourceId, food.source_id)))
			.get();
		if (existing) return existing.id;
	}
	const id = uuid();
	db.insert(foods)
		.values({
			id,
			name: food.name,
			source: food.source,
			sourceId: food.source === 'manual' ? null : food.source_id,
			nutrientsPer100g: JSON.stringify(food.nutrients),
			createdAt: new Date().toISOString()
		})
		.run();
	return id;
}

/**
 * Earlier matches by ingredient name (normalised), newest winning: every
 * ingredient in any version that already points at a stored food. This is the
 * "reuse cached foods by name" step, so known ingredients need no lookup.
 */
export function matchesByName(): Map<string, string> {
	const rows = db.all<{ name: string; food_id: string }>(sql`
		SELECT json_extract(i.value, '$.name') AS name, json_extract(i.value, '$.food_id') AS food_id
		FROM recipe_versions AS v, json_each(v.ingredients) AS i
		WHERE json_extract(i.value, '$.food_id') IN (SELECT id FROM foods)
		ORDER BY v.created_at ASC
	`);
	const map = new Map<string, string>();
	for (const r of rows) map.set(normalizeName(r.name), r.food_id);
	return map;
}
