import { InMemoryRequestRepository } from '@app/db/in-memory-request-repository.js';
import { describeRequestRepositoryContract } from '@test/repository-contract.js';

describeRequestRepositoryContract(
  'InMemoryRequestRepository',
  () => new InMemoryRequestRepository(),
);
