export const SORT_OPTIONS = [
    { value: "newest", label: "Newest First" },
    { value: "oldest", label: "Oldest First" },
    { value: "companyAsc", label: "Company (A - Z)" },
    { value: "companyDesc", label: "Company (Z - A)" },
    { value: "jobTitle", label: "Job Title" },
    { value: "status", label: "Status" }
]

export const DEFAULT_FILTER = {
    search: '',
    status: 'All',
    startDate: '',
    endDate: '',
    sortBy: 'newest'
}