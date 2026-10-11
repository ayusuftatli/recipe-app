-- recipe_versions is insert-only: reject any UPDATE at the database level.
CREATE TRIGGER `recipe_versions_no_update`
BEFORE UPDATE ON `recipe_versions`
BEGIN
	SELECT RAISE(ABORT, 'recipe_versions rows are immutable');
END;
