const SEEDED_COURSE_SLUG = 'postgresql-for-backend-developers';

type LessonView = {
  id: string;
  title: string;
  slug: string;
  isPreview: boolean;
};

type ModuleView = {
  id: string;
  title: string;
  sortOrder: number;
  lessons: LessonView[];
};

type CourseDetailView = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  shortDescription: string | null;
  priceAmount: number;
  currency: string;
  teacher: {
    id: string;
    displayName: string;
  };
  modules: ModuleView[];
};

const seededCourseFallback = {
  slug: SEEDED_COURSE_SLUG,
  title: 'PostgreSQL for Backend Developers',
  shortDescription: 'Hands-on PostgreSQL course covering data modeling and production SQL.',
  description: 'This course covers schema design, indexes, transactions, analytics queries, and database security.',
  modules: {
    1: {
      title: 'Module 1. Data Architecture',
      lessons: {
        'what-goes-to-postgres': 'What belongs in PostgreSQL and what belongs in object storage',
        'er-design-for-course-platform': 'Designing an ER diagram for a course platform',
      },
    },
    2: {
      title: 'Module 2. Performance',
      lessons: {
        'indexes-for-catalog-and-progress': 'Indexes for catalog and progress',
      },
    },
  },
} as const;

function hasCorruptedText(value: string | null | undefined): boolean {
  return typeof value === 'string' && (value.includes('\uFFFD') || /\?{3,}/.test(value));
}

export function normalizeSeededCourseTitle(slug: string, title: string): string {
  if (slug === seededCourseFallback.slug && hasCorruptedText(title)) {
    return seededCourseFallback.title;
  }

  return title;
}

export function normalizeSeededCourseDetail(course: CourseDetailView): CourseDetailView {
  if (course.slug !== seededCourseFallback.slug) {
    return course;
  }

  return {
    ...course,
    title: hasCorruptedText(course.title) ? seededCourseFallback.title : course.title,
    shortDescription: hasCorruptedText(course.shortDescription)
      ? seededCourseFallback.shortDescription
      : course.shortDescription,
    description: hasCorruptedText(course.description)
      ? seededCourseFallback.description
      : course.description,
    modules: course.modules.map((module) => {
      const moduleFallback = seededCourseFallback.modules[module.sortOrder as 1 | 2];
      const nextTitle = moduleFallback && hasCorruptedText(module.title)
        ? moduleFallback.title
        : module.title;

      return {
        ...module,
        title: nextTitle,
        lessons: module.lessons.map((lesson) => {
          const lessonFallback = moduleFallback?.lessons[lesson.slug as keyof typeof moduleFallback.lessons];
          return {
            ...lesson,
            title: lessonFallback && hasCorruptedText(lesson.title)
              ? lessonFallback
              : lesson.title,
          };
        }),
      };
    }),
  };
}
