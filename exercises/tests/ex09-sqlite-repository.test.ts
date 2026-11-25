import { openDatabase } from '@app/db/database.js';
import { SqliteRequestRepository } from '@app/db/sqlite-request-repository.js';
import { describeRequestRepositoryContract } from '@test/repository-contract.js';

describeRequestRepositoryContract(
  'SqliteRequestRepository',
  () => new SqliteRequestRepository(openDatabase(':memory:')),
);
