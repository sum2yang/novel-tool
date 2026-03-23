CREATE TYPE "OpenAIApiStyle" AS ENUM ('responses', 'chat_completions');

ALTER TABLE "ProviderEndpoint"
ADD COLUMN "openaiApiStyle" "OpenAIApiStyle" NOT NULL DEFAULT 'responses';
