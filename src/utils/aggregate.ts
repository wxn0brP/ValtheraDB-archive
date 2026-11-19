import { isUnsafeKey } from "@wxn0brp/db-core/utils/security";
import { Collection } from "mongodb";
import { cleanDocs } from ".";

function dropUnsafe(spec: any) {
	if (!spec || typeof spec !== "object") return spec;
	const safe: Record<string, any> = {};
	for (const key of Object.keys(spec)) {
		if (isUnsafeKey(key)) continue;
		safe[key] = spec[key];
	}
	return safe;
}

function numericExpr(field: string) {
	return {
		$cond: [
			{
				$isNumber: `$${field}`,
			},
			`$${field}`,
			"$$REMOVE",
		],
	};
}

function countExpr(field: string) {
	return {
		$sum: {
			$cond: [
				{
					$in: [
						{
							$type: `$${field}`,
						},
						[
							"missing",
							"null",
						],
					],
				},
				0,
				1,
			],
		},
	};
}

export async function nativeAggregate(
	coll: Collection,
	mongoQuery: any,
	dbFindOpts: any,
	opts: any = {},
) {
	const {
		min: minSpec,
		max: maxSpec,
		avg: avgSpec,
		groupBy,
		count: countSpec,
		sum: sumSpec,
		distinct,
		sortBy,
		sortAsc = true,
		offset = 0,
		limit = -1,
		reverse,
	} = dbFindOpts;

	const min = dropUnsafe(minSpec);
	const max = dropUnsafe(maxSpec);
	const avg = dropUnsafe(avgSpec);
	const count = dropUnsafe(countSpec);
	const sum = dropUnsafe(sumSpec);

	const pipeline: any[] = [];
	if (Object.keys(mongoQuery).length > 0) {
		pipeline.push({
			$match: mongoQuery,
		});
	}

	const hasAggregations = min || max || avg || groupBy || count || sum;

	if (hasAggregations) {
		const groupStage: Record<string, any> = {
			_id: null,
		};
		const groupFields = groupBy
			? Array.isArray(groupBy)
				? groupBy
				: [
						groupBy,
					]
			: [];

		if (groupFields.length === 1) {
			groupStage._id = `$${groupFields[0]}`;
		} else if (groupFields.length > 1) {
			groupStage._id = {};
			for (const field of groupFields) {
				groupStage._id[field] = `$${field}`;
			}
		}

		if (count) {
			for (const alias in count) groupStage[alias] = countExpr(count[alias]);
		}

		if (min)
			for (const alias in min)
				groupStage[alias] = {
					$min: numericExpr(min[alias]),
				};

		if (max)
			for (const alias in max)
				groupStage[alias] = {
					$max: numericExpr(max[alias]),
				};

		if (avg)
			for (const alias in avg)
				groupStage[alias] = {
					$avg: numericExpr(avg[alias]),
				};

		const sumCounters: Record<string, string> = {};
		if (sum) {
			for (const alias in sum) {
				groupStage[alias] = {
					$sum: numericExpr(sum[alias]),
				};
				const counter = `__vdb_numeric_${alias}`;
				sumCounters[alias] = counter;
				groupStage[counter] = {
					$sum: {
						$cond: [
							{
								$isNumber: `$${sum[alias]}`,
							},
							1,
							0,
						],
					},
				};
			}
		}

		pipeline.push({
			$group: groupStage,
		});

		const projectStage: Record<string, any> = {
			_id: 0,
		};

		if (groupFields.length === 1) {
			projectStage[groupFields[0]] = "$_id";
		} else if (groupFields.length > 1) {
			for (const field of groupFields) {
				projectStage[field] = `$_id.${field}`;
			}
		}

		if (count) for (const alias in count) projectStage[alias] = 1;
		if (min) for (const alias in min) projectStage[alias] = 1;
		if (max) for (const alias in max) projectStage[alias] = 1;
		if (avg) for (const alias in avg) projectStage[alias] = 1;
		if (sum) {
			for (const alias in sum) {
				projectStage[alias] = {
					$cond: [
						{
							$gt: [
								`$${sumCounters[alias]}`,
								0,
							],
						},
						`$${alias}`,
						null,
					],
				};
			}
		}

		pipeline.push({
			$project: projectStage,
		});
	}

	if (distinct && !isUnsafeKey(distinct)) {
		pipeline.push({
			$group: {
				_id: `$${distinct}`,
				__vdb_doc: {
					$first: "$$ROOT",
				},
			},
		});
		pipeline.push({
			$replaceRoot: {
				newRoot: "$__vdb_doc",
			},
		});
	}

	if (sortBy) {
		pipeline.push({
			$sort: {
				[sortBy]: sortAsc ? 1 : -1,
			},
		});
	}

	if (offset > 0)
		pipeline.push({
			$skip: offset,
		});
	if (limit === 0) return [];
	if (limit !== -1)
		pipeline.push({
			$limit: limit,
		});

	const results = await coll.aggregate(pipeline, opts).toArray();
	if (reverse && !sortBy) results.reverse();
	return cleanDocs(results);
}
