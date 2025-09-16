## Development with git, GitHub, and VSCode
### READ IF YOU HAVE NEVER DEVELOPED WITH GITHUB

This is the normal flow of development that most will follow.

### 1. Create Local Branch

1. It is best to create a branch where you can keep all of your changes seperate from master/main/mainline branch
1. Usually you would create a branch for each feature/component/change that you are working on
1. Remember that creating a branch on your local (NOT REMOTE...Remote is on GitHub) machine does not create the branch on remote

    `git checkout -b [name_of_your_new_branch]`
    
### 2. Create and Test your changes
1. Changes to a local branch will all be local; they do not cause anything to actually change on any branches.
2. Now that you have all the changes you want, YOU MUST TEST THEM OUT! DO NOT SUBMIT CODE TO REVIEW IF YOU HAVE NOT TESTED IT.
3. Next you have to stage/ammend your changes so that they can be picked up for your next commit.
3a. Either `git add [filename]` or VSCode -> Source Control tab -> Plus_Sign_Next_To_Files_You_Want_To_Stage
4. Once you have the changes you want to commit staged/ammended, you will commit and create a comment for your commit.
4a.  Either `git commit` or VSCode -> Source Control tab -> Commit
5. Now that you have a commit on your branch, and you're ready for it to go to review, you can perform a `git push`

### 3. Create a pull request
1. So you pushed your changes to your branch. You should strive to have good code, and should therefore allow others to validate this.
1a. Simply put, let others review your code and give you feedback.
2. On GitHub, you will see a Pull Request notification for your changes. Click on it and create a pull request.
3. In the Message/Comment section of your pull request, you can tag specific pople you would like to see review this.
4. Maybe there are some back and forth changes, that will be needed. Otherwise, you will be granted an approval.
5. Merge your Pull Request


THAT IS IT! WELL DONE!

Nothing ever goes this smoothly, so just be mentally prepared to solve any challenges/road blocks you face.
Below are some git command basics that might help out when working in an environment where multiple developers are updating files, creating pull requests, etc. GOOD LUCK!

### Basic git Commands

1. To see the status of your branch

    `git status`

2. To add files to your commit

    `git add [file_to_add]`

3. To commit the "added" changes to your branch

    `git commit -m '[Some comments about your change]'`

4. You can commit as many times as you would like, but to keep things clean when you go to push your changes, make sure you squash you commits into one single change

    `git rebase [name of master/main/mainline branch] -i`

5. You have your branch and master/main/mainline... people could've made changes to master/main/mainline which means you have to pull in those changes...

    ```
    git checkout [name of master/main/mainline branch]
    git pull
    ```

6. There are easier ways to do this, but by defining each step we can see what's happening more clearly

7. Now that you have pulled in any changes to master/main/mainline you have to add those changes to your other branch

    `git checkout [name_of_your_new_branch]`
    `git rebase [name of master/main/mainline branch]`