import { pgTable, text, timestamp, integer, serial, jsonb } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  script: text("script").notNull(),
  status: text("status").notNull().default("draft"), // draft, processing, ready
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const scenes = pgTable("scenes", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull(),
  text: text("text").notNull(),
  imageQuery: text("image_query").notNull(),
  imageUrl: text("image_url"),
  duration: integer("duration").notNull().default(4), // seconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
