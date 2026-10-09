import type { TestDefinition } from "../types";
import { addTests } from "./add";
import { advancedAggregationsTests } from "./advanced-aggregations";
import { advancedEventsTests } from "./advanced-events";
import { bulkAddTests } from "./bulk-add";
import { collectionApiTests } from "./collection-api";
import { collectionMgmtTests } from "./collection-mgmt";
import { compositeTests } from "./composite";
import { concurrencyTests } from "./concurrency";
import { countTests } from "./count";
import { dataTypesTests } from "./data-types";
import { edgeTests } from "./edge";
import { eventsTests } from "./events";
import { findAdvancedTests } from "./find-advanced";
import { findOpTests } from "./find-op";
import { idUtilsTests } from "./id-utils";
import { initTests } from "./init";
import { lifecycleTests } from "./lifecycle";
import { operatorInteractionsTests } from "./operator-interactions";
import { removeTests } from "./remove";
import { searchAdvancedTests } from "./search-advanced";
import { searchOpTests } from "./search-op";
import { sortingEdgeCasesTests } from "./sorting-edge-cases";
import { transactionTests } from "./transaction";
import { updateTests } from "./update";
import { updateOpTests } from "./update-op";

export const tests: TestDefinition[] = [
	...initTests,
	...lifecycleTests,
	...collectionMgmtTests,
	...addTests,
	...updateTests,
	...removeTests,
	...searchOpTests,
	...searchAdvancedTests,
	...updateOpTests,
	...findOpTests,
	...findAdvancedTests,
	...compositeTests,
	...edgeTests,
	...idUtilsTests,
	...eventsTests,
	...collectionApiTests,
	...dataTypesTests,
	...concurrencyTests,
	...advancedEventsTests,
	...operatorInteractionsTests,
	...advancedAggregationsTests,
	...sortingEdgeCasesTests,
	...transactionTests,
	...bulkAddTests,
	...countTests,
];
