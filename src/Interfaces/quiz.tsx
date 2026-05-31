export interface createQuizI {
  title: string;
  course: string;
  topic: string;
  dueDate:  Date;
  type?: "quiz" | "assignment";
}

export interface updateQuizI {
  title?: string;
  course?: string;
  topic?: string;
  dueDate?: string | Date;
  type?: "quiz" | "assignment";
}


