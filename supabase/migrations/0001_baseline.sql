


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."restrict_to_allowed_domains"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
  declare
    email_address text;
    email_domain  text;
    allowed       text[] := array['mozilla.com', 'jennywanger.com'];
  begin
    email_address := event->>'email';
    email_domain  := lower(split_part(email_address, '@', 2));

    if not (email_domain = any(allowed)) then
      return jsonb_build_object(
        'error', jsonb_build_object(
          'http_code', 403,
          'message',   'Sign-ins are restricted to Mozilla and authorized accounts.'
        )
      );
    end if;

    return event;
  end;
  $$;


ALTER FUNCTION "public"."restrict_to_allowed_domains"("event" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."share_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "share_id" "uuid" NOT NULL,
    "author" "text",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "author_name" "text",
    "card_id" "text" NOT NULL
);


ALTER TABLE "public"."share_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."share_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "share_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "share_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'editor'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."share_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "markdown" "text" NOT NULL,
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "settings" "jsonb",
    "collapsed_ids" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_id" "uuid",
    CONSTRAINT "shares_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'mozilla'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."shares" OWNER TO "postgres";


ALTER TABLE ONLY "public"."share_comments"
    ADD CONSTRAINT "share_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."share_members"
    ADD CONSTRAINT "share_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."share_members"
    ADD CONSTRAINT "share_members_share_id_user_id_key" UNIQUE ("share_id", "user_id");



ALTER TABLE ONLY "public"."shares"
    ADD CONSTRAINT "shares_pkey" PRIMARY KEY ("id");



CREATE INDEX "share_comments_share_id_card_id_created_at_idx" ON "public"."share_comments" USING "btree" ("share_id", "card_id", "created_at");



CREATE INDEX "share_members_share_id_user_id_idx" ON "public"."share_members" USING "btree" ("share_id", "user_id");



CREATE INDEX "share_members_user_id_share_id_idx" ON "public"."share_members" USING "btree" ("user_id", "share_id");



ALTER TABLE ONLY "public"."share_comments"
    ADD CONSTRAINT "share_comments_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."share_comments"
    ADD CONSTRAINT "share_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."share_members"
    ADD CONSTRAINT "share_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."share_members"
    ADD CONSTRAINT "share_members_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."share_members"
    ADD CONSTRAINT "share_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shares"
    ADD CONSTRAINT "shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");



CREATE POLICY "create requires auth" ON "public"."shares" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "members read private shares" ON "public"."shares" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."share_members"
  WHERE (("share_members"."share_id" = "share_members"."id") AND ("share_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "members see membership" ON "public"."share_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."share_members" "sm2"
  WHERE (("sm2"."share_id" = "sm2"."share_id") AND ("sm2"."user_id" = "auth"."uid"())))));



CREATE POLICY "read comments on accessible shares" ON "public"."share_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."shares" "s"
  WHERE (("s"."id" = "share_comments"."share_id") AND (("s"."visibility" = ANY (ARRAY['public'::"text", 'mozilla'::"text"])) OR (EXISTS ( SELECT 1
           FROM "public"."share_members" "sm"
          WHERE (("sm"."share_id" = "s"."id") AND ("sm"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "read public shares" ON "public"."shares" FOR SELECT USING ((("visibility" = 'public'::"text") AND ("auth"."uid"() IS NOT NULL)));



ALTER TABLE "public"."share_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."share_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shares" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";



REVOKE ALL ON FUNCTION "public"."restrict_to_allowed_domains"("event" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restrict_to_allowed_domains"("event" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."restrict_to_allowed_domains"("event" "jsonb") TO "supabase_auth_admin";



GRANT ALL ON TABLE "public"."share_comments" TO "anon";
GRANT ALL ON TABLE "public"."share_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."share_comments" TO "service_role";



GRANT ALL ON TABLE "public"."share_members" TO "anon";
GRANT ALL ON TABLE "public"."share_members" TO "authenticated";
GRANT ALL ON TABLE "public"."share_members" TO "service_role";



GRANT ALL ON TABLE "public"."shares" TO "anon";
GRANT ALL ON TABLE "public"."shares" TO "authenticated";
GRANT ALL ON TABLE "public"."shares" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







