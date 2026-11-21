export type DependencyReview = {
    name: string;
    version: string;
    integrity: string;
    filesSha256: string;
    license: string;
    licenseFiles: readonly string[];
    imports: readonly string[];
    dependencies: Readonly<Record<string, string>>;
    review: string;
};

export const approvedDependencies: readonly DependencyReview[] = [];
