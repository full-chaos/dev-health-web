import { setAcrLogger } from "@full-chaos/ask-dev/acr-client";

import { logger } from "@/lib/logger";

/** The ACR browser client's lines go to web's logger. */
setAcrLogger(logger);
