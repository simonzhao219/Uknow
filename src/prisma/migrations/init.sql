-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "real_name" TEXT NOT NULL,
    "id_number" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "phone" TEXT NOT NULL,
    "account_status" TEXT NOT NULL DEFAULT 'Pending',
    "point_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "active_referral_code_id" TEXT,
    "registration_step" INTEGER NOT NULL DEFAULT 0,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "grace_period_end" DATE NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_transaction_id" TEXT,
    "is_canceled" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_relationships" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "referee_id" TEXT NOT NULL,
    "referral_code_id" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_schedules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "referee_id" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "month_number" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "executed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "referee_id" TEXT,
    "generation" INTEGER,
    "month_number" INTEGER,
    "task_type" TEXT,
    "task_value" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "bank_code" TEXT NOT NULL,
    "bank_account" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "processor_note" TEXT,
    "transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "target_value" INTEGER NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "month_key" TEXT,
    "reward_amount" DECIMAL(10,2),
    "reward_issued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "gender" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "services" TEXT NOT NULL,
    "service_districts" TEXT NOT NULL,
    "contact_methods" TEXT NOT NULL,
    "photos" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "active_until" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_number_key" ON "users"("id_number");

-- CreateIndex
CREATE INDEX "idx_users_account_status" ON "users"("account_status");

-- CreateIndex
CREATE INDEX "idx_users_email_verified" ON "users"("email_verified");

-- CreateIndex
CREATE INDEX "idx_users_point_balance" ON "users"("point_balance");

-- CreateIndex
CREATE INDEX "idx_users_created_at" ON "users"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_status" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "idx_subscriptions_end_date" ON "subscriptions"("end_date");

-- CreateIndex
CREATE INDEX "idx_subscriptions_grace_period_end" ON "subscriptions"("grace_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE INDEX "idx_referral_codes_code" ON "referral_codes"("code");

-- CreateIndex
CREATE INDEX "idx_referral_codes_user_status" ON "referral_codes"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_referral_codes_is_active" ON "referral_codes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "referral_relationships_referee_id_key" ON "referral_relationships"("referee_id");

-- CreateIndex
CREATE INDEX "idx_referral_relationships_referrer_gen" ON "referral_relationships"("referrer_id", "generation");

-- CreateIndex
CREATE INDEX "idx_referral_relationships_is_active" ON "referral_relationships"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "reward_schedules_user_id_referee_id_generation_month_number_key" ON "reward_schedules"("user_id", "referee_id", "generation", "month_number");

-- CreateIndex
CREATE INDEX "idx_reward_schedules_date_status" ON "reward_schedules"("scheduled_date", "status");

-- CreateIndex
CREATE INDEX "idx_reward_schedules_user_status" ON "reward_schedules"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_reward_history_user_issued" ON "reward_history"("user_id", "issued_at" DESC);

-- CreateIndex
CREATE INDEX "idx_reward_history_type" ON "reward_history"("type");

-- CreateIndex
CREATE INDEX "idx_reward_history_issued" ON "reward_history"("issued_at" DESC);

-- CreateIndex
CREATE INDEX "idx_withdrawals_user_status" ON "withdrawals"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_withdrawals_status_requested" ON "withdrawals"("status", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_progress_user_id_task_type_month_key_key" ON "task_progress"("user_id", "task_type", "month_key");

-- CreateIndex
CREATE INDEX "idx_task_progress_type_completed" ON "task_progress"("task_type", "is_completed");

-- CreateIndex
CREATE INDEX "idx_task_progress_month_key" ON "task_progress"("month_key");

-- CreateIndex
CREATE UNIQUE INDEX "listings_user_id_key" ON "listings"("user_id");

-- CreateIndex
CREATE INDEX "idx_listings_active_city" ON "listings"("is_active", "city");

-- CreateIndex
CREATE INDEX "idx_listings_category" ON "listings"("category");

-- CreateIndex
CREATE INDEX "idx_listings_active_until" ON "listings"("active_until");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_relationships" ADD CONSTRAINT "referral_relationships_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_relationships" ADD CONSTRAINT "referral_relationships_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_relationships" ADD CONSTRAINT "referral_relationships_referral_code_id_fkey" FOREIGN KEY ("referral_code_id") REFERENCES "referral_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_schedules" ADD CONSTRAINT "reward_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_history" ADD CONSTRAINT "reward_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_progress" ADD CONSTRAINT "task_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
