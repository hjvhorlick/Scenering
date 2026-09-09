export interface Project {
  id: number;
  title: string;
  script: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Scene {
  id: number;
  project_id: number;
  order_index: number;
  text: string;
  image_query: string;
  image_url: string | null;
  duration: number;
  created_at: string;
}
